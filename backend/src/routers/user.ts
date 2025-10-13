import { PrismaClient } from "@prisma/client";
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { Router } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { authMiddlerware } from "../middleware.js";
import { createTaskInput } from "../types.js";

dotenv.config();

const DEFAULT_TITLE = "select the most clickable thumbnail"
const router = Router();
const jwtSecret = process.env.JWT_SECRET || "";
const prismaClient = new PrismaClient();
const s3Client = new S3Client({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY || "",
        secretAccessKey: process.env.AWS_SECRET_KEY || ""
    },
    region: "ap-south-1"
})

router.post("/task", authMiddlerware, async (req, res) => {
    //validate the input from user
    const body = req.body;
    // @ts-ignore
    const userId = req.userId;
    const parseData = createTaskInput.safeParse(body)

    
    if (!parseData.success) {
        return res.status(411).json({
            message: "You have sent the wrong inputs"
        })
    }

    let response = await prismaClient.$transaction(async tx => {
        const response = await tx.task.create({
            data: {
                title: parseData.data.title || "",
                amount: "1",
                signature: parseData.data.signature,
                user_id: userId
            }
        })

        await tx.option.createMany({
            data: parseData.data.options.map(x => ({
                image_url: x.imageUrl,
                task_id: response.id
            }))
        })
        return response
    })

    res.json({
        id: response.id
    })

})

router.get("/presignedUrl", authMiddlerware, async (req, res) => {

    // @ts-ignore
    const userId = req.userId;

    const { url, fields } = await createPresignedPost(s3Client, {
        Bucket: 'clix-lab',
        Key: `clix-lab-store/${userId}/${Math.random()}/image.png`,
        Conditions: [
            ['content-length-range', 0, 5 * 1024 * 1024] // 5 MB max
        ],
        Fields: {
            'Content-Type': 'image/png'
        },
        Expires: 3600
    })

    res.json({
        presignedUrl: url,
        fields
    })
})

router.post("/signin", async (req, res) => {
    // Todo: Add sign verification logic here
    const hardcodedWalletAddress = process.env.PUBLIC_ADDRESS || "";

    const existingUser = await prismaClient.user.findFirst({
        where: {
            address: hardcodedWalletAddress
        }
    })

    if (existingUser) {

        const token = jwt.sign({
            userId: existingUser.id
        }, jwtSecret)
        res.json({ token })
    } else {

        const user = await prismaClient.user.create({
            data: {
                address: hardcodedWalletAddress,
            }
        })
        const token = jwt.sign({
            userId: user.id
        }, jwtSecret)
        res.json({ token })
    }

});

export default router;

