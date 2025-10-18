import { WalletDisconnectButton, WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect } from "react";

export const Appbar = () => {
    const { publicKey, signMessage } = useWallet();

    const message = new TextEncoder().encode("Sign in to ClixLab");

    async function signAndSend() {
        const signature = await signMessage?.(message)
        console.log(signature);
        
    }

    useEffect(() => {
        signAndSend()
    })

    return (
        <div className="flex justify-between border-b pb-2 pt-2">
            <div className="text-2xl pl-4 flex justify-center pt-3">
                ClixLab
            </div>
            <div className="text-xl pr-4 ">
                {publicKey ? <WalletDisconnectButton /> : <WalletMultiButton />}

            </div>
        </div>
    )
}