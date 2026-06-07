import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

export default function Logo() {
  return (
    <Link href="/" style={{ textDecoration: "none" }}>
      <Wordmark />
    </Link>
  );
}
