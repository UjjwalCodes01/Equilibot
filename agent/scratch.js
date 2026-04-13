const { isAddress } = require('viem');
const addrA = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c".toLowerCase();
const addrB = "0x55d398326f99059fF775485246999027B3197955".toLowerCase();
console.log("addrA < addrB:", addrA < addrB);
console.log("token0:", addrA < addrB ? "A" : "B");
