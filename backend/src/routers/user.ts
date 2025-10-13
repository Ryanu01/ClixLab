import { PrismaClient } from "@prisma/client";

import { Router } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const router = Router();
const jwtSecret = process.env.JWT_SECRET || "";
const prismaClient = new PrismaClient();

router.post("/signin", async (req, res) => {
 // Todo: Add sign verification logic here
    const hardcodedWalletAddress = process.env.PUBLIC_ADDRESS || "";
    
    const existingUser = await prismaClient.user.findFirst({
        where: {
            address: hardcodedWalletAddress
        }
    })

    if(existingUser) {
        
        const token = jwt.sign({
            userId: existingUser.id
        }, jwtSecret)
        res.json({token})
    }else {

        const user = await prismaClient.user.create({
            data:{
                address: hardcodedWalletAddress,
            }
        })
        const token = jwt.sign({
            userId: user.id
        }, jwtSecret)
        res.json({token})
    }

});

export default router;

