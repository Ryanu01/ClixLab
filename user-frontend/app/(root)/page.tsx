"use client"

import Image from "next/image";
import { Appbar } from "../../components/Appbar";
import { useState } from "react";
import { Hero } from "@/components/Hero";
import { Upload } from "@/components/Upload";

export default function Home() {
   const [uploadedImage, setUploadedImage] = useState<string>();
  return (
    <main>
      <Appbar />
      <Hero />
      <Upload
      />
    </main>    

  );
}
