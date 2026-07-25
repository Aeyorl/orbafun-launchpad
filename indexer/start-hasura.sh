#!/bin/bash
docker run -d \
  --name envio-hasura \
  --network envio-network \
  -p 8088:8080 \
  -e HASURA_GRAPHQL_DATABASE_URL=postgres://postgres:testing@envio-postgres:5432/envio-dev \
  -e HASURA_GRAPHQL_ENABLE_CONSOLE=true \
  -e HASURA_GRAPHQL_ADMIN_SECRET=testing \
  -e HASURA_GRAPHQL_ENABLE_TELEMETRY=false \
  -e HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES=true \
  hasura/graphql-engine:v2.43.0
echo "EXIT=$?"
sleep 2
docker ps | grep hasura
