import type { NextPageContext } from "next";

type ErrorProps = {
  statusCode: number;
};

function ErrorPage({ statusCode }: ErrorProps) {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>{statusCode}</h1>
      <p>
        {statusCode === 404
          ? "This page could not be found."
          : "An error occurred on the server."}
      </p>
    </main>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 404;
  return { statusCode };
};

export default ErrorPage;
