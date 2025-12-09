import type { PublicClient } from "viem";
import type { Hex } from "viem";

export async function checkAuthorization(
    publicClient: PublicClient,
    address: Hex
): Promise<boolean> {
    try {
        const bytecode = await publicClient.getCode({ address });
        if (bytecode) {
            const bc = bytecode.toLowerCase();
            if (bc.startsWith("0xef0100") && bc.length >= 48) {
                const attachedAddress = "0x" + bc.slice(8, 48)
                console.log("Attached address:", attachedAddress);
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error("Error validating authorization:", error);
        return false;
    }
}
