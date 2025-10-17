"use client"

import Image from "next/image";
import { Appbar } from "../components/Appbar";
import { Uploadimage } from "../components/Uploadimage";
import { useState } from "react";
import { Hero } from "@/components/Hero";

export default function Home() {
   const [uploadedImage, setUploadedImage] = useState<string>();
  return (
    <main>
      <Appbar />
      <Hero />
      <Uploadimage
      />
    </main>    

  );
}
