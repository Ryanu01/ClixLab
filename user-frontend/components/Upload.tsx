"use client"

import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { UploadImage } from "./Uploadimage"
import { BACKEND_URL } from "../utils"
import axios from "axios"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useWallet, useConnection } from "@solana/wallet-adapter-react";

export const Upload = () => {
    const [images, setImages] = useState<string[]>([]);
    const [title, setTitle] = useState("");
    const [txSignature, setTxSignature] = useState("");
    const { publicKey, sendTransaction } = useWallet();
    const { connection } = useConnection();
    const [isProcessing, setIsProcessing] = useState(false)
    const router = useRouter();

    async function onSubmit() {
        const response = await axios.post(`${BACKEND_URL}/v1/user/task`, {
            options: images.map(image => ({
                imageUrl: image
            })),
            title,
            signature: txSignature
        }, {
            headers: {
                "Authorization": localStorage.getItem("token")
            }
        })

        router.push(`/task/${response.data.id}`);
    }


    async function makePayment() {
        if (!publicKey) {
            alert('Please connect your wallet first');
            return;
        }
        setIsProcessing(true);
        try {
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: publicKey!,
                    toPubkey: new PublicKey("C9MHYjMmEo3C9KZANhjMx9MgUY1hu95qRYaTMeJt4qhG"),
                    lamports: 100000000,
                })
            );
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;
            const signature = await sendTransaction(transaction, connection, {
                skipPreflight: false,
                preflightCommitment: 'finalized',
            });

            console.log('Transaction sent:', signature);
            const confirmation = await Promise.race([
                connection.confirmTransaction(
                    {
                        signature,
                        blockhash,
                        lastValidBlockHeight,
                    },
                    'confirmed' // Use 'confirmed' instead of 'finalized' for faster confirmation
                ),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Transaction confirmation timeout')), 60000)
                )
            ]);

             console.log('Transaction confirmed:', confirmation);
            setTxSignature(signature);
            alert('Payment successful! You can now submit your task.');
        } catch (error: any) {
            console.error('Payment error:', error);
            
            // Handle specific error types
            if (error.message?.includes('User rejected')) {
                alert('Transaction was rejected');
            } else if (error.message?.includes('Blockhash not found') || 
                       error.message?.includes('block height exceeded')) {
                alert('Transaction expired. Please try again with a fresh transaction.');
            } else if (error.message?.includes('timeout')) {
                alert('Transaction is taking longer than expected. Please check Solana Explorer with your wallet address.');
            } else {
                alert(`Payment failed: ${error.message || 'Unknown error'}`);
            }
            
            setTxSignature('');
        } finally {
            setIsProcessing(false);
        }

        // const {
        //     context: { slot: minContextSlot },
        //     value: { blockhash, lastValidBlockHeight }
        // } = await connection.getLatestBlockhashAndContext();

        // const signature = await sendTransaction(transaction, connection, { minContextSlot });
        
    }

    return (
        <div className="flex justify-center">
            <div className="max-w-screen-lg w-full">
                <div className="text-2xl text-left pt-20 w-full pl-4">
                    Create a task
                </div>
                <label className="pl-4 block mt-2 text-md font-medium text-gray-900 " >Task Details</label>

                <input onChange={(e) => {
                    setTitle(e.target.value);
                }} type="text" id="first_name" className="ml-4 mt-1 bg-gray-50 border-gray-300 text-gray-900 text-sm rounded-lg focus: ring-blue-500 focus: border-blue-500 block w-full p-2.5" placeholder="What is your task" />

                <label className="pl-4 block mt-8 text-md font-medium text-gray-900">Add Images</label>
                <div className="flex justify-center pt-4 max-w-screen-lg">
                    {
                        images.map(image => <UploadImage key={image} image={image}
                            onImageAdded={(imageUrl) => {
                                setImages(i => [...i, imageUrl])
                            }}
                        />)}
                </div>

                <div className="ml-4 pt-2 flex justify-center">
                    <UploadImage
                        onImageAdded={(imageUrl) => {
                            setImages(i => [...i, imageUrl])
                        }}
                    />
                </div>

                <div className="flex justify-center">
                    <button onClick={txSignature ? onSubmit : makePayment} type="button"
                        className="mt-4 text-white bg-gray-800 hover:bg-gray-900 focus: outline-none focus:ring-4 focus:ring-gray-300 font-medium rounded-full tetx-sm px-5 py-2.5 mb-2 dark:bg-gray-800 dark: hover:bg-gray-700 dark: focus:ring-gray-700 dark:border-gray-700"
                    >
                        {isProcessing 
                    ? 'Processing...' 
                    : txSignature 
                        ? "Submit task" 
                        : "Pay 0.1 SOL"
                }
                    </button>
                </div>
            </div>
        </div>
    )
}