// =====================================================
// config/constants.js — Firebase & App Constants
// =====================================================

export const netlifyFirebaseConfig = {
    apiKey: "AIzaSyDe6Q82taE7_BRCqUsHcaLBCvheKBLIZzY",
    authDomain: "hola-workspace-system.firebaseapp.com",
    databaseURL: "https://hola-workspace-system-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "hola-workspace-system",
    storageBucket: "hola-workspace-system.firebasestorage.app",
    messagingSenderId: "920702716632",
    appId: "1:920702716632:web:d1f9be05cc48f69e1ce5ad"
};

export const DEFAULT_APP_ID = 'hola-v20';

export const DEFAULT_SETTINGS = {
    // Auth & Admin
    adminPin: "hola2026",

    // Branding & Info
    description: "يتم حساب التكلفة تلقائياً بناءً على الوقت المنقضي.",
    logoUrl: "",
    aboutPageUrl: "",

    // Loyalty
    loyaltyText: "اجمع 7 أختام = كود خصم 100%!",
    stampsRequired: 7,

    // Capacity & Pricing
    maxCapacity: 50,
    pricingTier1: 25,
    pricingTier2: 15,
    pricingTier3: 10,
    after3rdType: 'free',
    after3rdPrice: 0,
    after3rdNote: "",
    graceMinutes: 0,

    // Staff
    shiftManagers: ["مدير النظام"],

    // Payment
    vfNumber: "",
    vfName: "",
    instapayLink: "",

    // Promo / Media
    promoImg: "",
    promoLink: "",
    promoText: "",
    promoEmbed: "",

    // Location
    workspaceLat: 26.559074,
    workspaceLng: 31.695689,
    workspaceRadius: 500,

    // Rooms
    roomsActive: false,

    // Events (legacy inline)
    evTitle: "", evDesc: "", evTime: "", evImg: "", evActive: false,
    ev2_evTitle: "", ev2_evDesc: "", ev2_evTime: "", ev2_evImg: "", ev2_evActive: false,
    ev3_evTitle: "", ev3_evDesc: "", ev3_evTime: "", ev3_evImg: "", ev3_evActive: false,

    // Music Voting
    voteLoud: 0,
    voteBad: 0,
    musicVoteRound: 1,

    // Social Links
    fbPageLink: "",
    igPageLink: "",
    whatsappNum: "",

    // Place Status
    placeClosed: false,

    // Free Drink
    freeDrinkEnabled: false,
    freeDrinkMode: "first_visit",

    // WiFi Info
    wifiEnabled: false,
    wifiSSID: "",
    wifiPassword: "",
    wifiSecurity: "WPA",

    // Bio Links (array)
    bioLinks: []
};