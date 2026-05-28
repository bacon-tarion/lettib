if (
  process.env.NODE_ENV === "production" &&
  process.env.MOCK_MODE === "true"
) {
  throw new Error(
    "MOCK_MODE=true is not allowed when NODE_ENV=production. Remove MOCK_MODE from production environment variables."
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
