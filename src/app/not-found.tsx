import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="home">
      <div className="card">
        <h1>Not found</h1>
        <p className="muted">This table or page does not exist. Check the QR code or start from the home page.</p>
        <Link href="/" className="btn">
          Go home
        </Link>
      </div>
    </main>
  );
}
