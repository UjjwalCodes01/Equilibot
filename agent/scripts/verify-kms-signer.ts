import process from 'node:process'
import { config as loadDotenv } from 'dotenv'
import {
  createPublicClient,
  http,
  keccak256,
  recoverAddress,
  toHex,
  type Address,
  type Hex,
} from 'viem'
import { createSigner } from '../src/services/signer.js'
import { equiliBotModuleAbi } from '../src/abi/equilibot-module.js'

loadDotenv()

async function resolveManagedSignerAddress(): Promise<Address> {
  const explicit = process.env.MANAGED_SIGNER_ADDRESS as Address | undefined
  if (explicit) {
    return explicit
  }

  const rpcHttpUrl = process.env.RPC_HTTP_URL
  const moduleAddress = process.env.MODULE_ADDRESS as Address | undefined

  if (!rpcHttpUrl || !moduleAddress) {
    throw new Error(
      'MANAGED_SIGNER_ADDRESS is not set and cannot be auto-resolved (requires RPC_HTTP_URL and MODULE_ADDRESS)'
    )
  }

  const client = createPublicClient({ transport: http(rpcHttpUrl) })
  const moduleAgent = await client.readContract({
    address: moduleAddress,
    abi: equiliBotModuleAbi,
    functionName: 'agent',
  })

  return moduleAgent
}

async function main(): Promise<void> {
  if (process.env.SIGNER_MODE !== 'managed') {
    throw new Error('SIGNER_MODE must be managed to run KMS verification')
  }

  const missingAwsVars: string[] = []
  if (!process.env.AWS_REGION) missingAwsVars.push('AWS_REGION')
  if (!process.env.AWS_KMS_KEY_ID) missingAwsVars.push('AWS_KMS_KEY_ID')
  if (!process.env.RPC_PRIVATE_URL) missingAwsVars.push('RPC_PRIVATE_URL')

  if (missingAwsVars.length > 0) {
    throw new Error(`Missing required env for KMS verification: ${missingAwsVars.join(', ')}`)
  }

  const managedSignerAddress = await resolveManagedSignerAddress()

  const signer = createSigner(
    'managed',
    undefined,
    managedSignerAddress,
    'aws-kms',
    process.env.RPC_PRIVATE_URL,
    process.env.AWS_REGION,
    process.env.AWS_KMS_KEY_ID
  )

  const healthy = await signer.healthCheck()
  if (!healthy) {
    throw new Error('Managed signer health check failed')
  }

  if (!signer.signTransactionDigest) {
    throw new Error('Managed signer does not expose signTransactionDigest')
  }

  const digest = keccak256(toHex(Buffer.from(`equilibot-kms-verify:${Date.now()}`)))
  const signature = await signer.signTransactionDigest(digest)

  const recovered = await recoverAddress({
    hash: digest,
    signature: {
      r: signature.r,
      s: signature.s,
      yParity: signature.yParity,
    },
  })

  if (recovered.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `Recovered address mismatch: expected ${signer.address}, got ${recovered}`
    )
  }

  const output = {
    ok: true,
    signerAddress: signer.address,
    recoveredAddress: recovered,
    digest: digest as Hex,
    signedAt: new Date().toISOString(),
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
