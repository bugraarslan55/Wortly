// Dinamik uygulama yapılandırması: statik app.json'u OLDUĞU GİBİ döndürür ve yalnızca EAS'ın derleme sırasında kendisinin
// verdiği profil adını (EAS_BUILD_PROFILE: development | preview | production | ...) extra.buildProfile olarak ekler.
// Uygulama, Supabase bağlantı korumasında bu değeri kullanır (utils/supabase.ts). EAS dışı yerel derlemede anahtar HİÇ eklenmez
// (null yazmak bazı araçlarda {} olarak serileşir ve yanlış okunur).
module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE ? String(process.env.EAS_BUILD_PROFILE) : null;
  return {
    ...config,
    extra: { ...(config.extra ?? {}), ...(profile ? { buildProfile: profile } : {}) },
  };
};
