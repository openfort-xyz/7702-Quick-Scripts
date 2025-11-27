import { computeKeyIdEOA, computeKeyIdP256 } from "../src/helpers/keysHelper";

console.log("=== Testing Key ID Computation ===\n");

// Test EOA key ID
const eoaAddress = "0xCdeaA61C5956BfB99e06FB93d8241848dC091127";
const eoaKeyId = computeKeyIdEOA(eoaAddress);
console.log("EOA Address:", eoaAddress);
console.log("EOA Key ID:", eoaKeyId);

// Test P256 key ID
const pubKeyX = "0x99d993ec0781efe6e22267f56058c1ff411d623a25ad4bf37c456182315d24fb";
const pubKeyY = "0xd109412f4e6781450c5487fb3b0c28b92371ebb1d74ee066f57b1ed4956e515b";
const p256KeyId = computeKeyIdP256(pubKeyX, pubKeyY);
console.log("\nP256 Public Key X:", pubKeyX);
console.log("P256 Public Key Y:", pubKeyY);
console.log("P256 Key ID:", p256KeyId);

console.log("\n✅ Key ID computation successful!");
