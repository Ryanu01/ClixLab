"use client"

import { Appbar } from "@/components/Appbar"
import { BACKEND_URL } from "@/utils"
import axios from "axios"
import React, { useEffect, useState } from "react";


async function getTaskDetails(taskId: string) {
    const response = await axios.get(`${BACKEND_URL}/v1/user/task?taskId=${taskId}`, {
        headers: {
            "Authorization": localStorage.getItem("token")
        }
    });

    return response.data

}


export default function Page({ params }
    
 : { params: Promise<{ taskId: string }> }) {
    const { taskId } = React.use(params)

    const [result, setResult] = useState<Record<string, {
        count: number;
        option: {
            imageUrl: string
        }
    }>>({});

    const [taskDetails, setTaskDetails] = useState<{
        title?: string
    }>({});

    useEffect(() => {
        getTaskDetails(taskId).then((data) => {
            setResult(data.result)
            setTaskDetails(data.taskDetails)
        })
        .catch((error) => console.error("Error fetching task details", error))
    }, [taskId]);

    
    return (
        <div>
            <Appbar />
            <div className="text-2xl pt-20 flex justify-center">
                {taskDetails?.title || "Loading.."}
            </div>
            <div className="flex justify-center pt-8">
                {Object.keys(result || {}).map(taskId => <Task  key={taskId} imageUrl={result[taskId].option.imageUrl} votes={result[taskId].count} />)}
            </div>
        </div>
    )

}

export function Task({ imageUrl, votes }: {
    imageUrl: string,
    votes: number
}) {
    return (
        <div>
            <img className={"p-2 w-96 rounded-md"} src={imageUrl} />
            <div className="flex justify-center">
                {votes}
            </div>
        </div>
    )
}