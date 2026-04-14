import { NextResponse } from "next/server";

const SAFE_SIGNER_ADDRESSES =
  process.env.SAFE_SIGNER_ADDRESSES ??
  process.env.NEXT_PUBLIC_SAFE_SIGNER_ADDRESSES ??
  "";

function parseSignerAddresses(): string[] {
  return SAFE_SIGNER_ADDRESSES.split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.toLowerCase();

  if (!address) {
    return NextResponse.json(
      {
        isSigner: false,
        unavailable: false,
        reason: "Missing wallet address query parameter.",
      },
      { status: 400 },
    );
  }

  const signers = parseSignerAddresses();

  if (signers.length === 0) {
    return NextResponse.json(
      {
        isSigner: false,
        unavailable: true,
        reason: "SAFE_SIGNER_ADDRESSES is not configured.",
      },
      { status: 200 },
    );
  }

  const isSigner = signers.includes(address);

  return NextResponse.json(
    {
      isSigner,
      unavailable: false,
      safeAddress: process.env.SAFE_ADDRESS ?? undefined,
      reason: isSigner ? "Wallet is an authorized Safe signer." : "Wallet is not listed in SAFE_SIGNER_ADDRESSES.",
    },
    { status: 200 },
  );
}
