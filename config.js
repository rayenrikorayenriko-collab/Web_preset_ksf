/* =========================================================
   KONFIGURASI — satu-satunya file yang perlu kamu ubah.
   Isinya diambil dari dashboard Supabase:
   Project Settings -> API.
   ========================================================= */
window.KF_CONFIG = {
  /* URL project Supabase */
  supabaseUrl: 'https://visrptcqtakqqqkhybtp.supabase.co',

  /* Publishable / anon key.
     Aman dipakai di halaman publik karena akses tulis dijaga
     oleh Row Level Security (lihat file setup.sql). */
  supabaseKey: 'sb_publishable_kJ4ZZUv3RIB1e3hHGASnMw_1UMYTgCf',

  /* Nama bucket penyimpanan media (harus sama dengan di setup.sql) */
  bucket: 'media',

  /* Email user admin yang kamu buat di Supabase
     (Authentication -> Users -> Add user).
     Password user ini = QWERTY12354  (bisa kamu ganti di Supabase). */
  adminEmail: 'admin@kessoku.com'
};
