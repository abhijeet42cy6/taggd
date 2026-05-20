#!/usr/bin/env sh
# Reference deploy for AWS App Runner (portable container — same image as GCP).
# Prereqs: ECR repo, RDS PostgreSQL DATABASE_URL, S3 bucket for STORAGE_BACKEND=s3.
#
#   export AWS_REGION=ap-south-1
#   export ECR_URI=123456789.dkr.ecr.ap-south-1.amazonaws.com/tgddata-api
#   export DATABASE_URL='postgresql+psycopg://...?sslmode=require'
#   docker build -f Dockerfile.backend -t "${ECR_URI}:latest" .
#   docker push "${ECR_URI}:latest"
#   aws apprunner create-service ... (see docs/CLOUD_RUN_AND_MULTI_CLOUD_DEPLOYMENT.md)
set -e
echo "See docs/CLOUD_RUN_AND_MULTI_CLOUD_DEPLOYMENT.md for App Runner / ECS task definitions."
echo "Build: docker build -f Dockerfile.backend -t tgddata-api ."
echo "Run:  docker run -p 8080:8080 -e PORT=8080 -e DATABASE_URL=... -e APP_ENV=production tgddata-api"
