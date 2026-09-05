import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main className="landing">
      <h1 className="landing__title">
        <span className="landing__title-sub">Nothing here yet.</span>
      </h1>
      <Link className="landing__link" to="/">
        Back to the console
      </Link>
    </main>
  );
}
