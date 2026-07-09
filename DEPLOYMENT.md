# Deployment

## GitHub Pages

The `.github/workflows/deploy-pages.yml` workflow deploys on pushes to `main` and
supports manual dispatch.

## Azure Storage static website

```bash
az storage account update \
  --name YOUR_STORAGE_ACCOUNT \
  --resource-group YOUR_RESOURCE_GROUP \
  --enable-static-website true \
  --index-document index.html \
  --404-document index.html

az storage blob upload-batch \
  --account-name YOUR_STORAGE_ACCOUNT \
  --auth-mode login \
  --destination '$web' \
  --source . \
  --overwrite
```

Do not store Azure credentials or connection strings in this repository.

## Local server

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173/`.
