# ShareScreen — Dokploy Deployment

## Dosyalar
- `Dockerfile` — iki aşamalı: Vite build → minimal runtime (express + ws + dist)
- `docker-compose.yml` — Dokploy uyumlu servis + Traefik labels
- `.dockerignore` — node_modules/dist gitmiyor, image küçük kalıyor

## Dokploy'de kurulum adımları

1. **Yeni Compose projesi:** Dokploy → Projects → Create → **Compose** tipi seç.
   - Git repo bağla (bu repoyu push etmen gerekir) veya "Upload" ile dosyaları yükle.

2. **Environment değişkeni ekle** (Compose sekmesi → Environment):
   ```
   SHARESCREEN_DOMAIN=screen.senindomain.com
   ```
   Bu, Traefik `Host()` kuralında kullanılır. (Alternatif: labels'taki `${SHARESCREEN_DOMAIN}` yerine domaini elle yaz.)

3. **Domain:** Compose dosyasındaki Traefik label'ları otomatik router oluşturur:
   - `https://$SHARESCREEN_DOMAIN` → container:3000
   - TLS: `letsencrypt` certresolver (Dokploy'un varsayılanı). DNS A kaydını sunucu IP'sine yöneltmeyi unutma.
   - İstersen labels'ı tamamen silip Dokploy'un **Domains sekmesinden** domain ekleyebilirsin — o zaman Dokploy label'ları kendisi üretir. İki yöntem de geçerli; labels'ta bıraktım çünkü WebSocket upgrade Traefik'te default açık.

4. **Deploy** butonuna bas. Healthcheck `/health` endpoint'ine bakar; yeşil dönene kadar bekle.

## Deploy sonrası doğrulama

```bash
curl https://$SHARESCREEN_DOMAIN/health
# {"status":"ok",...}
```

- Yayın: `https://$SHARESCREEN_DOMAIN` → Yayın Aç
- İzleyici linki: `https://$SHARESCREEN_DOMAIN/?room=KOD`
- Embed: `https://$SHARESCREEN_DOMAIN/embed?room=KOD`

## Notlar
- **WebRTC media P2P'dir** — Traefik/sunucu üzerinden akmaz, sadece signaling (WebSocket) proxy'lenir. Traefik WebSocket upgrade'i default destekler, ekstra ayar gerekmez.
- Symmetric NAT'a düşen izleyici olursa STUN yetmeyebilir; TURN ihtiyacı doğarsa ayrıca konuşuruz (önceki denemede istek üzerine kaldırılmıştı).
- Ölçek: tek container, tek port (3000). Birden fazla replica **çalışmaz** — signaling state'i (rooms) container RAM'inde tutuluyor. Yüksek erişim gerekirse sticky-session + Redis gerekecek; şu an tek instance doğru.
- `restart: unless-stopped` — sunucu restart olunca otomatik döner.
