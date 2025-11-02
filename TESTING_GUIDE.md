# 🧪 Testing Guide - Image Repositories

## Quick Verification

### 1. Run Integration Test
```bash
node test-image-repos.js
```
**Expected output:** All checks should pass with ✓

---

## Unit Tests

### Run All Image Tests
```bash
npm test -- src/modules/images
```

### Run OpenAI Repository Tests Only
```bash
npm test -- src/modules/images/repositories/openai/__tests__/openaiImages.repository.test.ts
```

### Run Gemini Repository Tests Only
```bash
npm test -- src/modules/images/repositories/gemini/__tests__/geminiImages.repository.test.ts
```

### Run Tests in Watch Mode
```bash
npm run test:watch -- src/modules/images
```

### Generate Coverage Report
```bash
npm run test:coverage -- src/modules/images
```

---

## Manual Testing with Slack

### Prerequisites
1. Configure `.env` with API keys
2. Set `IMAGE_REPOSITORY_TYPE` in `.env`
3. Start Redis: `redis-server`
4. Start the bot: `npm run dev`

### Test OpenAI (DALL-E 3)
```bash
# In .env
IMAGE_REPOSITORY_TYPE=OPENAI
```

**Slack command:**
```
img a beautiful sunset over mountains
```

**Expected response:**
```
Generando imagen...
Imágenes generadas con openai:
Imagen #1: https://oaidalleapiprodscus.blob.core.windows.net/...
```

**Verify:**
- [ ] Image URL is valid and accessible
- [ ] Response mentions "openai" provider
- [ ] Image saved to database (check with `/images/get-images`)

### Test Gemini (Imagen 3)
```bash
# In .env
IMAGE_REPOSITORY_TYPE=GEMINI
```

**Slack command:**
```
img a photorealistic portrait of a cat
```

**Expected response:**
```
Generando imagen...
Imágenes generadas con gemini:
Imagen #1: https://...
```

**Verify:**
- [ ] Image URL is valid and accessible
- [ ] Response mentions "gemini" provider
- [ ] Image saved to database

### Test Leap (if you have API key)
```bash
# In .env
IMAGE_REPOSITORY_TYPE=LEAP
```

**Slack command:**
```
img a sunset
```

**Expected response:**
```
Generando imagen...
Imágenes generadas con leap:
Imagen #1: https://...
```

**Verify:**
- [ ] Polling works correctly (may take several seconds)
- [ ] Response mentions "leap" provider
- [ ] Image saved to database

---

## Web Interface Testing

### Test GET /images/get-images
```bash
curl -X GET "http://localhost:4000/images/get-images?page=1&pageSize=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected response:**
```json
{
  "data": [
    {
      "id": 1,
      "imageUrl": "https://...",
      "inferenceId": "openai-123456789",
      "prompt": "a beautiful sunset",
      "provider": "openai",
      "createdAt": "2025-11-02T..."
    }
  ],
  "page": 1,
  "pageSize": 10,
  "count": 1
}
```

**Verify:**
- [ ] Images from all providers are returned
- [ ] Pagination works correctly
- [ ] Each image has the correct provider field

---

## Error Handling Tests

### Test Missing API Key
```bash
# Remove OPENAI_API_KEY from .env
IMAGE_REPOSITORY_TYPE=OPENAI
```

**Slack command:**
```
img test
```

**Expected:**
- Service should throw error: "OPENAI_API_KEY is not defined"
- Graceful error message to user

### Test Invalid API Key
```bash
# Set invalid key in .env
OPENAI_API_KEY=sk-invalid-key
```

**Expected:**
- Error logged in console
- User receives: "No se pudo generar la imagen"

### Test Rate Limiting
1. Send multiple requests rapidly
2. Verify 429 errors are caught
3. Check console for "rate limit exceeded" message

---

## Performance Testing

### Test Response Times

**DALL-E 3:**
```bash
time echo "img sunset" | # send to slack
```
Expected: ~3-8 seconds

**Gemini:**
```bash
time echo "img sunset" | # send to slack
```
Expected: ~2-6 seconds

**Leap:**
```bash
time echo "img sunset" | # send to slack
```
Expected: ~10-30 seconds (with polling)

---

## Database Verification

### Check Saved Images
```bash
sqlite3 src/database/database.sqlite

SELECT id, imageUrl, inferenceId, prompt, username, createdAt
FROM images
ORDER BY createdAt DESC
LIMIT 5;
```

**Verify:**
- [ ] Images from all providers are saved
- [ ] `inferenceId` format is correct for each provider:
  - OpenAI: `openai-{timestamp}`
  - Gemini: `gemini-{timestamp}-{index}`
  - Leap: `{leap_inference_id}`
- [ ] All fields are populated correctly

---

## Regression Testing

### Verify No Breaking Changes

**Test existing Slack commands still work:**
- [ ] `cb hello` (conversations)
- [ ] `cb_show` (show conversation)
- [ ] `cb_clean` (clear conversation)
- [ ] Alert/task/note commands

**Test existing web endpoints still work:**
- [ ] GET `/conversations/...`
- [ ] GET `/alerts/...`
- [ ] GET `/tasks/...`

---

## Common Issues & Solutions

### Issue: "Cannot find module IImageRepository"
**Solution:** Run `npm install` to ensure all dependencies are installed

### Issue: Tests fail with "jest is not defined"
**Solution:**
```bash
npm install --save-dev @types/jest
```

### Issue: "Image generation takes too long"
**Solution:**
- Check network connection
- Verify API key is valid
- For Leap: Polling delay is 1 second, may take longer

### Issue: "Images not showing in /get-images"
**Solution:**
- Verify database connection
- Check that images are being saved (console logs)
- Ensure ImagesDataSources.createImages() is called

### Issue: "Imagen API is only accessible to billed users"
**Error:** `got status: 400 Bad Request. {"error":{"code":400,"message":"Imagen API is only accessible to billed users at this time.","status":"INVALID_ARGUMENT"}}`

**Causa:** Google Gemini Imagen 3 requiere billing habilitado en Google Cloud

**Soluciones:**
1. **Opción 1 - Usar OpenAI (Recomendado):**
   ```bash
   # En .env
   IMAGE_REPOSITORY_TYPE=OPENAI
   ```

2. **Opción 2 - Habilitar billing en Google Cloud:**
   - Ve a https://console.cloud.google.com/billing
   - Asocia una tarjeta de crédito
   - Habilita la API de Vertex AI
   - Costo: ~$0.03/imagen
   - Google ofrece $300 en créditos gratis para nuevos usuarios

3. **Opción 3 - Usar Leap (si tienes acceso):**
   ```bash
   # En .env
   IMAGE_REPOSITORY_TYPE=LEAP
   ```

---

## Debugging

### Enable Debug Logs
Add to code temporarily:
```typescript
// In openaiImages.repository.ts
console.log('🔍 Calling DALL-E 3 with prompt:', prompt)
console.log('🔍 Options:', options)
console.log('🔍 Response:', response.data)
```

### Check Network Requests
```bash
# Monitor axios requests
# Add axios interceptor in repository
axios.interceptors.request.use(request => {
  console.log('Starting Request', request)
  return request
})
```

### Verify Environment Variables
```bash
node -e "console.log(process.env.IMAGE_REPOSITORY_TYPE)"
node -e "console.log(process.env.OPENAI_API_KEY?.substring(0, 10))"
```

---

## CI/CD Testing

### GitHub Actions (if configured)
Ensure these environment variables are set in GitHub Secrets:
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `IMAGE_REPOSITORY_TYPE`

### Docker Testing
```bash
# Build image
./build-docker.sh

# Run container with env vars
docker run -e IMAGE_REPOSITORY_TYPE=OPENAI \
           -e OPENAI_API_KEY=sk-... \
           -p 4000:4000 -p 3001:3001 \
           slack-bot
```

---

## Test Coverage Goals

### Minimum Coverage
- [ ] Unit tests: >80% coverage
- [ ] Integration tests: All critical paths
- [ ] Manual tests: All providers tested

### Current Coverage
Run to check:
```bash
npm run test:coverage -- src/modules/images
```

**Target areas:**
- ✅ Repository implementations
- ✅ Service layer
- ✅ Error handling
- ✅ Factory pattern
- ✅ Singleton pattern

---

## Next Steps After Testing

1. ✅ All unit tests pass
2. ✅ Manual testing with all 3 providers
3. ✅ Web interface works
4. ✅ No regressions in other modules
5. 📝 Document any issues found
6. 🚀 Ready for production deployment

---

## Support

If you encounter issues:
1. Check console logs for error messages
2. Verify API keys are valid
3. Review IMPLEMENTATION_SUMMARY.md
4. Check CLAUDE.md for architecture details
