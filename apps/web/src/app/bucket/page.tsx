"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BucketRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/parks?status=bucketList"); }, [router]);
  return null;
}
