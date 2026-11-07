// ─────────────────────────────────────────────────────────────
//  Daniel’s Soirée – Konfiguration
//  Nur diese Datei musst du anpassen.
// ─────────────────────────────────────────────────────────────

export const CONFIG = {
  // Supabase → Project Settings → API
  // Solange beide Felder leer sind, läuft die Seite im Demo-Modus
  // (Daten bleiben nur im Browser, Admin-Passwort: "soiree").
  supabaseUrl: "https://yizbwxxydyobioalcmns.supabase.co",
  supabaseAnonKey: "sb_publishable_SwvFgTPOMqDxIGa3DRVe7g_-aJ4vwvJ",

  event: {
    title: "Daniel’s Soirée",
    subtitle: "40th Birthday & Gender Reveal",
    date: "07 · 11 · 2026",
    place: "Gaia Loft · Neuss",
  },

  guestbook: {
    maxChars: 1000,
  },

  // Emojis, die Gäste im Gästebuch und bei den Beichten antippen können
  emojis: ["🥂","🍾","🎉","🎂","🎈","❤️","🤍","💛","🥰","😍","😘","😂","🤣","😊","😉","😎","🙌","👏","🙏","✨","🔥","💫","👶","🍼","💙","💗","🦀","💃","🕺","🌴"],

  kiosk: {
    idleSeconds: 90,        // ohne Berührung → zurück zum Startbildschirm, Felder werden geleert
    adminIdleSeconds: 180,  // Admin-Bereich meldet sich danach automatisch ab
    screensaverSeconds: 300, // Bildschirmschoner nach 5 Minuten ohne Berührung
  },

  confessions: {
    maxChars: 500,
    prompts: [
      "Was ist deine lustigste Erinnerung mit Daniel?",
      "Was sollte Daniels Kind später unbedingt über seinen Papa erfahren?",
      "Was hast du Daniel noch nie erzählt?",
      "Welche peinliche Geschichte über Daniel kennst du?",
      "Was würdest du Daniel nach drei Gläsern Wein beichten?",
      "Was ist heute Abend dein kleines Geheimnis?",
    ],
  },

  // ── Party-Quiz ───────────────────────────────────────────────
  // 50 Entweder-oder-Fragen. "correct" = Daniels eigene Antwort
  // (0 = erste Option, 1 = zweite). quizPerRound: Fragen pro Runde.
  // Danach kann man weitere Runden spielen (ohne Wiederholung, bis
  // alle 50 durch sind). Rang = Trefferquote über alle Runden.
  quizPerRound: 10,
  quiz: [
    { q: "Was trinkt Daniel morgens lieber?", options: ["Kaffee", "Saft"], correct: 1 },
    { q: "An der Bar bestellt Daniel eher …", options: ["Glas Wein", "Gin Tonic"], correct: 1 },
    { q: "Urlaub lieber …", options: ["am Strand", "in der Stadt"], correct: 1 },
    { q: "Daniel ist eher …", options: ["Frühaufsteher", "Nachteule"], correct: 1 },
    { q: "Hund oder Katze?", options: ["Hund", "Katze"], correct: 0 },
    { q: "Pizza oder Sushi?", options: ["Pizza", "Sushi"], correct: 0 },
    { q: "Auf dem Wasser lieber …", options: ["Wakeboard", "Wakesurf"], correct: 1 },
    { q: "Lieblingsjahreszeit?", options: ["Sommer", "Winter"], correct: 0 },
    { q: "Freitagabend lieber …", options: ["Couch und Netflix", "Ausgehen"], correct: 1 },
    { q: "Essen gehen lieber …", options: ["im Stammlokal", "immer was Neues"], correct: 1 },
    { q: "Kurztrip lieber …", options: ["Städtetrip", "Natur pur"], correct: 0 },
    { q: "Smartphone?", options: ["iPhone", "Android"], correct: 0 },
    { q: "Traumauto?", options: ["Cabrio", "SUV"], correct: 0 },
    { q: "Lieber selbst kochen oder essen gehen?", options: ["Selbst kochen", "Essen gehen"], correct: 1 },
    { q: "Rotwein oder Weißwein?", options: ["Rotwein", "Weißwein"], correct: 1 },
    { q: "Daniel ist …", options: ["immer pünktlich", "gern 5 Minuten zu spät"], correct: 1 },
    { q: "Planer oder spontan?", options: ["Planer", "Spontan"], correct: 0 },
    { q: "Im Fernsehen lieber …", options: ["Fußball", "Formel 1"], correct: 0 },
    { q: "Steak oder Pasta?", options: ["Steak", "Pasta"], correct: 0 },
    { q: "Schuhe lieber …", options: ["Sneaker", "Lederschuhe"], correct: 0 },
    { q: "Musik lieber …", options: ["Hip-Hop", "House"], correct: 0 },
    { q: "Morgens zuerst …", options: ["Sport", "Frühstück"], correct: 0 },
    { q: "Lieber ein Buch oder ein Podcast?", options: ["Buch", "Podcast"], correct: 1 },
    { q: "Kölsch oder Alt?", options: ["Kölsch", "Alt"], correct: 0 },
    { q: "Auf der Party eher …", options: ["auf der Tanzfläche", "an der Bar"], correct: 0 },
    { q: "Daniels Handy-Akku ist meistens …", options: ["fast voll", "fast leer"], correct: 1 },
    { q: "Daniels Schreibtisch ist …", options: ["aufgeräumt", "kreatives Chaos"], correct: 1 },
    { q: "Shoppen lieber …", options: ["online", "im Laden"], correct: 1 },
    { q: "Im Kino lieber …", options: ["Action", "Komödie"], correct: 0 },
    { q: "Duschen lieber …", options: ["morgens", "abends"], correct: 1 },
    { q: "Eis lieber …", options: ["Schoko", "Vanille"], correct: 1 },
    { q: "Lieber telefonieren oder Sprachnachricht?", options: ["Telefonieren", "Sprachnachricht"], correct: 1 },
    { q: "Daniel freut sich mehr über …", options: ["ein Erlebnis", "ein Geschenk zum Auspacken"], correct: 0 },
    { q: "Im Flugzeug lieber …", options: ["Fenster", "Gang"], correct: 0 },
    { q: "Frühstück lieber …", options: ["süß", "herzhaft"], correct: 0 },
    { q: "In einer Diskussion ist Daniel eher …", options: ["Diplomat", "Dickkopf"], correct: 0 },
    { q: "Zu Hause kocht besser …", options: ["Daniel", "die werdende Mama"], correct: 1 },
    { q: "Nachts beim Baby aufstehen wird öfter …", options: ["Daniel", "die Mama"], correct: 1 },
    { q: "Daniel hat insgeheim gehofft auf …", options: ["ein Mädchen", "einen Jungen"], correct: 0 },
    { q: "Als Papa wird Daniel eher …", options: ["der Lockere", "der Strenge"], correct: 0 },
    { q: "Daniel tippt, das erste Wort wird …", options: ["Mama", "Papa"], correct: 0 },
    { q: "Mit 18 wollte Daniel eher …", options: ["Unternehmer werden", "Rockstar werden"], correct: 0 },
    { q: "Lieber ein Jahr ohne …", options: ["Handy", "Urlaub"], correct: 1 },
    { q: "Superkraft?", options: ["Fliegen", "Gedanken lesen"], correct: 1 },
    { q: "Der Beige-Dresscode war die Idee von …", options: ["Daniel", "der werdenden Mama"], correct: 0 },
    { q: "Heute Abend bleibt Daniel bis …", options: ["Mitternacht", "Sonnenaufgang"], correct: 1 },
    { q: "Erster Gedanke morgens?", options: ["Arbeit", "Frühstück"], correct: 0 },
    { q: "Mit 40 fühlt sich Daniel wie …", options: ["29", "49"], correct: 0 },
    { q: "Daniel entspannt am besten …", options: ["auf dem Wasser", "auf dem Sofa"], correct: 0 },
    { q: "Wer sagt öfter „Ich liebe dich“ zuerst?", options: ["Daniel", "die werdende Mama"], correct: 1 },
  ],
};
