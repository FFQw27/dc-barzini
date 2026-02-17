# Barzini Ailesi Discord Artı/Eksi Botu

Bu sürüm **sadece `config.js` düzenleyerek** çalışacak şekilde hazırlandı.

## 1) Kurulum

```bash
npm install
```

## 2) config.js doldur

`config.js` içinde sadece şu alanları girmen yeterli:

- `token`: Bot token
- `guildId`: Sunucu ID
- `warningChannelId`: Haftalık raporun düşeceği kanal ID
- `managerIds`: Komut kullanabilecek yönetici ID listesi
- `timezone`: Saat dilimi (`Europe/Istanbul`)

## 3) Botu başlat

```bash
npm start
```

## Komutlar

- `/arti kullanici sebep miktar`
- `/eksi kullanici sebep miktar`
- `/haftalik_rapor`

## Sistem nasıl çalışır?

- Sadece `managerIds` içindeki kişiler komut çalıştırabilir.
- `/arti` veya `/eksi` kullanıldığında:
  - Kayıt `data.json` dosyasına yazılır.
  - Hedef kullanıcıya DM gönderilir.
- Haftalık rapor:
  - Her pazartesi saat 09:00'da otomatik gönderilir.
  - İstersen `/haftalik_rapor` ile manuel de atabilirsin.

## Discord izinleri

Botta en az şu izinler olmalı:

- Send Messages
- Use Application Commands
- View Channels
- Read Message History


## Hata cozum (Used disallowed intents)

Eger `Used disallowed intents` hatasi aliyorsan nedeni genelde **GuildMembers intenti** olur.
Bu projede o intent kaldirildi, ekstra bir ayar acman gerekmiyor.

Yine de ayni hatayi alirsan:
- Botun guncel kodu kullandigindan emin ol (`npm install` sonra `npm start`)
- Discord Developer Portal > Bot ekraninda gereksiz Privileged Gateway Intents kapali olsun
