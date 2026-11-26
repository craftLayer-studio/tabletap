import Link from "next/link";

export function AppHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="app-header">
      <Link href="/" className="brand" aria-label="TableTap home">
        Table<span>Tap</span>
      </Link>
      <div className="app-header__title">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <span className="demo-pill" title="Demo restaurant with made-up data">
        Demo
      </span>
    </header>
  );
}
