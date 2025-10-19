import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { workerauthMiddlerware } from "../middleware.js";
import { getNextTask } from "../db.js";
import { createSubmissionInput } from "../types.js";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import pkg from "bs58"
import { PRIVATE_KEY } from "../privateKey.js";

const {decode} = pkg
const TOTAL_SUBMISSION = 100;
const connection = new Connection(process.env.RPC_URL ?? "")
const TOTAL_DECIMALS = 1000_000_000;

const jwtSecret = process.env.JWT_SECRET_WORKER || "";
const prismaClient = new PrismaClient();
const router = Router();


// router.post("/payout", workerauthMiddlerware, async (req, res) => {
//     // @ts-ignore
//     const userId: string = req.userId
//     const worker = await prismaClient.worker.findFirst({
//         where: {
//             id: Number(userId)
//         }
//     })

//     if (!worker) {
//         return res.status(403).json({
//             message: "User not found"
//         })
//     }

//     const transaction = new Transaction().add(
//         SystemProgram.transfer({
//             fromPubkey: new PublicKey("C9MHYjMmEo3C9KZANhjMx9MgUY1hu95qRYaTMeJt4qhG"),
//             toPubkey: new PublicKey(worker.address),
//             lamports: 1000_000_000 * worker.pending_amount / TOTAL_DECIMALS,
//         })
//     );

//     const address = worker?.address;
//     console.log("1", address);
    
//     if (!address) {
//         return res.json({
//             message: "User not found"
//         })
//     }
//     //logic to create a txns
//     if (!PRIVATE_KEY || typeof PRIVATE_KEY !== 'string') {
//         return res.status(500).json({
//             message: "Server Error"
//         })
//     }

//     // Now TypeScript knows PRIVATE_KEY is a string
//     const keypair = Keypair.fromSecretKey(decode(PRIVATE_KEY));


//     let signature = ""

//     try {
//         signature = await sendAndConfirmTransaction(
//             connection,
//             transaction,
//             [keypair]
//         )
//     } catch (error) {
//         return res.json({
//             message: "Transaction failed"
//         })
//     }

//     console.log("2", signature);
    

//     // user is able to send multiple reqts need to fix this 
//     // dont knwo how though
//     console.log(worker.pending_amount);
//     await prismaClient.$transaction(async tx => {
//         await tx.worker.update({
//             where: {
//                 id: Number(userId)
//             },
//             data: {
//                 pending_amount: {
//                     decrement: worker.pending_amount
//                 },
//                 locked_amount: {
//                     increment: worker.pending_amount
//                 }
//             }
//         })

//         await tx.payouts.create({
//             data: {
//                 worker_id: Number(userId),
//                 amount: worker.pending_amount,
//                 status: "Processign",
//                 signature: signature
//             }
//         })
//     })

//     console.log(worker.locked_amount);
//     /**
//      * After doing this we need to send the tnx to eth/sol
//      * blockchain
//      */

//     res.json({
//         message: "Processing payout",
//         amount: worker.pending_amount
//     })
// })


router.post("/payout", workerauthMiddlerware, async (req, res) => {
    // @ts-ignore
    const userId: string = req.userId

    try {
        // Step 1: Lock the funds in database first (FAST operation)
        const lockResult = await prismaClient.$transaction(async tx => {
            const worker = await tx.worker.findFirst({
                where: {
                    id: Number(userId)
                }
            })

            if (!worker) {
                throw new Error("User not found")
            }

            if (!worker.address) {
                throw new Error("Worker address not found")
            }

            if (worker.pending_amount <= 0) {
                throw new Error("No pending amount to payout")
            }

            // Check for existing processing payout
            const existingPayout = await tx.payouts.findFirst({
                where: {
                    worker_id: Number(userId),
                    status: "Processign"
                }
            })

            if (existingPayout) {
                throw new Error("Payout already in progress")
            }

            const amountToPay = worker.pending_amount

            // Lock the amount
            await tx.worker.update({
                where: {
                    id: Number(userId)
                },
                data: {
                    pending_amount: {
                        decrement: amountToPay
                    },
                    locked_amount: {
                        increment: amountToPay
                    }
                }
            })

            // Create payout record without signature
            const payout = await tx.payouts.create({
                data: {
                    worker_id: Number(userId),
                    amount: amountToPay,
                    status: "Processign",
                    signature: ""
                }
            })

            return {
                address: worker.address,
                amountToPay,
                payoutId: payout.id
            }
        }) 

        console.log("1", lockResult.address);

        // Step 2: Perform blockchain transaction OUTSIDE Prisma transaction
        if (!PRIVATE_KEY || typeof PRIVATE_KEY !== 'string') {
            // Rollback
            await prismaClient.worker.update({
                where: { id: Number(userId) },
                data: {
                    pending_amount: { increment: lockResult.amountToPay },
                    locked_amount: { decrement: lockResult.amountToPay }
                }
            })
            await prismaClient.payouts.update({
                where: { id: lockResult.payoutId },
                data: { status: "Failure" }
            })
            return res.status(500).json({
                message: "Server Error"
            })
        }

        const keypair = Keypair.fromSecretKey(decode(PRIVATE_KEY));

        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: new PublicKey("C9MHYjMmEo3C9KZANhjMx9MgUY1hu95qRYaTMeJt4qhG"),
                toPubkey: new PublicKey(lockResult.address),
                lamports: 1000_000_000 * lockResult.amountToPay / TOTAL_DECIMALS,
            })
        );

        let signature = ""
        try {
            signature = await sendAndConfirmTransaction(
                connection,
                transaction,
                [keypair]
            )
            console.log("2", signature);
        } catch (error) {
            console.error("Blockchain transaction failed:", error)
            
            // Rollback the database changes
            await prismaClient.worker.update({
                where: { id: Number(userId) },
                data: {
                    pending_amount: { increment: lockResult.amountToPay },
                    locked_amount: { decrement: lockResult.amountToPay }
                }
            })
            await prismaClient.payouts.update({
                where: { id: lockResult.payoutId },
                data: { status: "Failure" }
            })
            
            return res.status(500).json({
                message: "Transaction failed"
            })
        }

        // Step 3: Update payout with signature and mark as completed
        await prismaClient.payouts.update({
            where: { id: lockResult.payoutId },
            data: {
                signature: signature,
                status: "Sucess"
            }
        })

        // Move from locked to completed
        await prismaClient.worker.update({
            where: { id: Number(userId) },
            data: {
                locked_amount: { decrement: lockResult.amountToPay }
            }
        })

        return res.json({
            message: "Payout completed successfully",
            signature: signature,
            amount: lockResult.amountToPay
        })

    } catch (error: any) {
        console.error("Payout error:", error);
        
        if (error.message === "User not found") {
            return res.status(403).json({ message: "User not found" })
        }
        if (error.message === "Worker address not found") {
            return res.status(400).json({ message: "Worker address not found" })
        }
        if (error.message === "No pending amount to payout") {
            return res.status(400).json({ message: "No pending amount to payout" })
        }
        if (error.message === "Payout already in progress") {
            return res.status(409).json({ message: "Payout already in progress" })
        }
        
        return res.status(500).json({
            message: "Payout processing failed"
        })
    }
})


router.get("/balance", workerauthMiddlerware, async (req, res) => {

    // @ts-ignore
    const userId: string = req.userId;

    const worker = await prismaClient.worker.findFirst({
        where: {
            id: Number(userId)
        }
    })

    res.json({
        pendingAmount: worker?.pending_amount,
        lockedAmount: worker?.locked_amount
    })

})

router.post("/submission", workerauthMiddlerware, async (req, res) => {
    // @ts-ignore
    const userId = req.userId;
    const body = req.body;
    const parsedBody = createSubmissionInput.safeParse(body);

    if (parsedBody.success) {
        const task = await getNextTask(userId)
        if (!task || task?.id !== Number(parsedBody.data.taskId)) {
            return res.status(411).json({
                message: "Incorrect task id"
            })
        }

        const amountMade = (task.amount) / TOTAL_SUBMISSION
        console.log(amountMade);

        const submission = await prismaClient.$transaction(async tnx => {

            const submission = await tnx.submission.create({
                data: {
                    option_id: Number(parsedBody.data.selection),
                    worker_id: userId,
                    task_id: Number(parsedBody.data.taskId),
                    amount: amountMade
                },

            })
            console.log("new line", amountMade);

            await tnx.worker.update({
                where: {
                    id: userId
                },
                data: {
                    pending_amount: {
                        increment: amountMade
                    }
                }
            })

            return submission
        },
            {
                maxWait: 5000, // default 2000ms - time to wait for transaction to start
                timeout: 20000,
            })



        const nextTask = await getNextTask(userId);
        res.json({
            nextTask,
            amountMade
        })
    } else {
        res.status(411).json({
            message: "Error occured while submiting next task"
        })
    }
})

router.get("/nextTask", workerauthMiddlerware, async (req, res) => {
    // @ts-ignore
    const userId: string = req.userId;

    const task = await getNextTask(Number(userId));

    if (!task) {
        res.status(411).json({
            message: "No more tasks left for you to review"
        })
    } else {
        res.status(200).json({
            task
        })
    }
})

router.post("/signin", async (req, res) => {

    const { publicKey, signature } = req.body;
    const message = new TextEncoder().encode("Sign in to ClixLab as a worker")

    console.log(publicKey)
    const result = nacl.sign.detached.verify(
        message,
        new Uint8Array(signature.data),
        new PublicKey(publicKey).toBytes()
    )
    console.log("HERIE");

    console.log(result);

    if (!result) {
        return res.status(411).json({
            message: "Incorrect signature"
        })
    }

    const existingUser = await prismaClient.worker.findFirst({
        where: {
            address: publicKey
        }
    })

    if (existingUser) {

        const token = jwt.sign({
            userId: existingUser.id
        }, jwtSecret)
        res.json({
            token,
            amount: existingUser.pending_amount / TOTAL_DECIMALS
        })
    } else {

        const user = await prismaClient.worker.create({
            data: {
                address: publicKey,
                pending_amount: 0,
                locked_amount: 0
            }
        })
        const token = jwt.sign({
            userId: user.id
        }, jwtSecret)
        res.json({
            token,
            amount: 0
        })
    }
});

export default router;
