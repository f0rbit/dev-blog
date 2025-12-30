#!/bin/bash
set -e

echo "=== Setting up Cloudflare resources for blog-devpad ==="

# Create production resources
echo "Creating production D1 database..."
bunx wrangler d1 create blog-devpad-db

echo "Creating production R2 bucket..."
bunx wrangler r2 bucket create blog-devpad-corpus

# Create preview resources
echo "Creating preview D1 database..."
bunx wrangler d1 create blog-devpad-db-preview

echo "Creating preview R2 bucket..."
bunx wrangler r2 bucket create blog-devpad-corpus-preview

# Create Pages project
echo "Creating Pages project..."
bunx wrangler pages project create blog-devpad --production-branch=main

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "1. Copy the database IDs from above into wrangler.toml"
echo "2. Add these secrets to GitHub:"
echo "   - CLOUDFLARE_API_TOKEN"
echo "   - CLOUDFLARE_ACCOUNT_ID"
echo "3. Run migrations:"
echo "   bunx wrangler d1 migrations apply blog-devpad-db --remote"
echo "   bunx wrangler d1 migrations apply blog-devpad-db-preview --remote --env preview"
