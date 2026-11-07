// Konten dan konfigurasi seed data manual.
//
// Semua teks sengaja memakai bahasa Indonesia dan konteks rumah sakit supaya
// data terasa seperti operasional IT sehari-hari, bukan lorem ipsum.

export const TIMEZONE = "Asia/Jakarta";

export const PROFILES = {
  tiny: {
    key: "tiny",
    label: "Tiny",
    description: "10 tiket, satu per status penting — cukup untuk smoke test.",
    tickets: 10,
    days: 3,
    problems: 2,
    articles: 4,
    incidents: 1,
  },
  small: {
    key: "small",
    label: "Kecil",
    description: "±24 tiket dalam 2 minggu, semua modul terisi.",
    tickets: 24,
    days: 14,
    problems: 4,
    articles: 7,
    incidents: 2,
  },
  medium: {
    key: "medium",
    label: "Sedang",
    description: "±60 tiket dalam 1 bulan, laporan mulai terlihat berisi.",
    tickets: 60,
    days: 30,
    problems: 5,
    articles: 9,
    incidents: 3,
  },
  busy: {
    key: "busy",
    label: "Sibuk",
    description: "±150 tiket dalam 3 bulan, seperti ITSM yang aktif dipakai.",
    tickets: 150,
    days: 90,
    problems: 6,
    articles: 10,
    incidents: 4,
  },
};

export const DEFAULTS = {
  profile: "small",
  tickets: null,
  days: null,
  baseUrl: process.env.PB_URL || "http://127.0.0.1:8090",
  superuserEmail: process.env.PB_ADMIN_EMAIL || "admin@itsm.local",
  superuserPassword: process.env.PB_ADMIN_PASSWORD || "PasswordKuat123!",
  password: "SeedDemo123!",
  emailDomain: "demo.local",
  tenantCode: "",
  tenantName: "",
  hospitals: 1,
  reset: false,
  yes: false,
  age: true,
  quiet: false,
  seed: null,
  setupToken: process.env.SETUP_TOKEN || "",
};

// Rumah sakit demo. `hospitals > 1` hanya dipakai pada mode vendor agar konsol
// vendor punya pembanding laporan lintas RS.
export const HOSPITALS = [
  {
    code: "DEMO01",
    name: "RS Sehat Digital",
    city: "Jakarta",
    domain: "demo.local",
    timezone: TIMEZONE,
  },
  {
    code: "DEMO02",
    name: "RS Mitra Sehat",
    city: "Bandung",
    domain: "demo2.local",
    timezone: TIMEZONE,
  },
  {
    code: "DEMO03",
    name: "RS Bunda Sejahtera",
    city: "Surabaya",
    domain: "demo3.local",
    timezone: TIMEZONE,
  },
];

// Kode unit mengikuti seed master default (lib/tenant_seed.js).
export const UNITS = {
  IGD: { code: "IGD", name: "IGD", manager: "managerIgd" },
  RANAP: { code: "RANAP", name: "Rawat Inap", manager: "managerRanap" },
  RAJAL: { code: "RAJAL", name: "Rawat Jalan", manager: "managerRajal" },
  FARMASI: { code: "FARMASI", name: "Farmasi", manager: "managerFarmasi" },
  LAB: { code: "LAB", name: "Laboratorium", manager: "managerLab" },
  RAD: { code: "RAD", name: "Radiologi", manager: "managerRad" },
  KASIR: { code: "KASIR", name: "Kasir dan BPJS", manager: "managerKasir" },
  RM: { code: "RM", name: "Rekam Medis", manager: "managerRm" },
  MGT: { code: "MGT", name: "Manajemen", manager: "managerMgt" },
  IT: { code: "IT", name: "IT", manager: "lead" },
};

export const SERVICE_ROUTING = {
  SIMRS: { team: "application", owner: "lead" },
  INFRA: { team: "network", owner: "lead" },
  DEVICE: { team: "hardware", owner: "support" },
  ACCESS: { team: "service_desk", owner: "support" },
  INTEGRASI: { team: "application", owner: "lead" },
  LAINNYA: { team: "other", owner: "support" },
};

export const USERS = [
  {
    key: "lead",
    local: "lead.it",
    name: "Andi Pratama",
    role: "it_lead",
    unit: "IT",
    jobTitle: "Kepala IT",
    team: "",
  },
  {
    key: "lead2",
    local: "lead2.it",
    name: "Rina Kusuma",
    role: "it_lead",
    unit: "IT",
    jobTitle: "Kepala IT (Wakil)",
    team: "",
  },
  {
    key: "support",
    local: "support",
    name: "Bayu Setiawan",
    role: "it_support",
    unit: "IT",
    jobTitle: "Staff IT Service Desk",
    team: "service_desk",
  },
  {
    key: "support2",
    local: "support2",
    name: "Sari Melati",
    role: "it_support",
    unit: "IT",
    jobTitle: "Staff IT Aplikasi",
    team: "application",
  },
  {
    key: "viewer",
    local: "viewer",
    name: "Hendra Wijaya",
    role: "viewer",
    unit: "MGT",
    jobTitle: "Pengamat Manajemen",
    team: "",
  },
  {
    key: "resolverApp",
    local: "resolver.app",
    name: "Dimas Prakoso",
    role: "resolver",
    unit: "IT",
    jobTitle: "Programmer SIMRS",
    team: "application",
  },
  {
    key: "resolverNet",
    local: "resolver.net",
    name: "Joko Susilo",
    role: "resolver",
    unit: "IT",
    jobTitle: "Teknisi Jaringan",
    team: "network",
  },
  {
    key: "resolverHw",
    local: "resolver.hw",
    name: "Agus Salim",
    role: "resolver",
    unit: "IT",
    jobTitle: "Teknisi Hardware",
    team: "hardware",
  },
  {
    key: "resolverDb",
    local: "resolver.db",
    name: "Fitri Handayani",
    role: "resolver",
    unit: "IT",
    jobTitle: "Database Administrator",
    team: "database",
  },
  {
    key: "resolverBio",
    local: "resolver.bio",
    name: "Rudi Hartono",
    role: "resolver",
    unit: "IT",
    jobTitle: "Teknisi Alat Kesehatan",
    team: "biomedical",
  },
  {
    key: "managerIgd",
    local: "manajer.igd",
    name: "dr. Maya Sari",
    role: "requester",
    unit: "IGD",
    jobTitle: "Kepala Unit IGD",
  },
  {
    key: "managerRanap",
    local: "manajer.ranap",
    name: "Ns. Rina Wati",
    role: "requester",
    unit: "RANAP",
    jobTitle: "Kepala Rawat Inap",
  },
  {
    key: "managerRajal",
    local: "manajer.rajal",
    name: "dr. Hendra Gunawan",
    role: "requester",
    unit: "RAJAL",
    jobTitle: "Kepala Rawat Jalan",
  },
  {
    key: "managerFarmasi",
    local: "manajer.farmasi",
    name: "Apt. Nia Kurnia",
    role: "requester",
    unit: "FARMASI",
    jobTitle: "Kepala Farmasi",
  },
  {
    key: "managerLab",
    local: "manajer.lab",
    name: "Dewi Lestari",
    role: "requester",
    unit: "LAB",
    jobTitle: "Kepala Laboratorium",
  },
  {
    key: "managerRad",
    local: "manajer.rad",
    name: "Rina Marlina",
    role: "requester",
    unit: "RAD",
    jobTitle: "Kepala Radiologi",
  },
  {
    key: "managerKasir",
    local: "manajer.kasir",
    name: "Siti Aminah",
    role: "requester",
    unit: "KASIR",
    jobTitle: "Kepala Kasir dan BPJS",
  },
  {
    key: "managerRm",
    local: "manajer.rm",
    name: "Yuli Astuti",
    role: "requester",
    unit: "RM",
    jobTitle: "Kepala Rekam Medis",
  },
  {
    key: "managerMgt",
    local: "manajer.mgt",
    name: "Bambang Sutrisno",
    role: "requester",
    unit: "MGT",
    jobTitle: "Manajer Umum",
  },
  {
    key: "nurseIgd",
    local: "perawat.igd",
    name: "Ns. Dewi Anggraini",
    role: "requester",
    unit: "IGD",
    jobTitle: "Perawat IGD",
  },
  {
    key: "nurseRanap",
    local: "perawat.ranap",
    name: "Ns. Tuti Herawati",
    role: "requester",
    unit: "RANAP",
    jobTitle: "Perawat Rawat Inap",
  },
  {
    key: "adminRajal",
    local: "admin.rajal",
    name: "Linda Marlina",
    role: "requester",
    unit: "RAJAL",
    jobTitle: "Admin Poliklinik",
  },
  {
    key: "apoteker",
    local: "apoteker",
    name: "Apt. Fajar Nugraha",
    role: "requester",
    unit: "FARMASI",
    jobTitle: "Apoteker",
  },
  {
    key: "analystLab",
    local: "analis.lab",
    name: "Andi Nugroho",
    role: "requester",
    unit: "LAB",
    jobTitle: "Analis Laboratorium",
  },
  {
    key: "radiografer",
    local: "radiografer",
    name: "Bayu Saputra",
    role: "requester",
    unit: "RAD",
    jobTitle: "Radiografer",
  },
  {
    key: "kasirStaff",
    local: "kasir",
    name: "Wawan Setiawan",
    role: "requester",
    unit: "KASIR",
    jobTitle: "Kasir BPJS",
  },
  {
    key: "rmStaff",
    local: "rm",
    name: "Yuni Astuti",
    role: "requester",
    unit: "RM",
    jobTitle: "Perekam Medis",
  },
  {
    key: "mgtStaff",
    local: "mgt",
    name: "Agus Firmansyah",
    role: "requester",
    unit: "MGT",
    jobTitle: "Staf Manajemen",
  },
];

export const REQUESTERS_BY_UNIT = {
  IGD: ["nurseIgd"],
  RANAP: ["nurseRanap"],
  RAJAL: ["adminRajal"],
  FARMASI: ["apoteker"],
  LAB: ["analystLab"],
  RAD: ["radiografer"],
  KASIR: ["kasirStaff"],
  RM: ["rmStaff"],
  MGT: ["mgtStaff"],
  IT: ["support"],
};

// Nomor aset sengaja tetap agar bisa dijalankan ulang tanpa duplikasi.
export const ASSETS = [
  {
    assetNo: "AST-DEMO-001",
    name: "PC Pendaftaran IGD 1",
    type: "workstation",
    status: "active",
    criticality: "high",
    unit: "IGD",
    service: "SIMRS",
    owner: "nurseIgd",
    location: "IGD - Loket Pendaftaran",
    warrantyEnd: "2027-06-30",
    notes: "Workstation pendaftaran pasien IGD, terhubung printer thermal.",
  },
  {
    assetNo: "AST-DEMO-002",
    name: "Printer Thermal Antrean IGD",
    type: "printer",
    status: "active",
    criticality: "high",
    unit: "IGD",
    service: "DEVICE",
    owner: "nurseIgd",
    location: "IGD - Ruang Tunggu",
    warrantyEnd: "2026-12-31",
    notes: "Printer nomor antrean, kertas thermal 80mm.",
  },
  {
    assetNo: "AST-DEMO-003",
    name: "PC Workstation Farmasi 1",
    type: "workstation",
    status: "active",
    criticality: "medium",
    unit: "FARMASI",
    service: "SIMRS",
    owner: "apoteker",
    location: "Farmasi - Depo Rawat Jalan",
    warrantyEnd: "2027-03-31",
    notes: "",
  },
  {
    assetNo: "AST-DEMO-004",
    name: "Printer Label Obat Farmasi",
    type: "printer",
    status: "maintenance",
    criticality: "medium",
    unit: "FARMASI",
    service: "DEVICE",
    owner: "apoteker",
    location: "Farmasi - Depo Rawat Inap",
    warrantyEnd: "2026-11-30",
    notes: "Sering macet; menunggu penggantian roller.",
  },
  {
    assetNo: "AST-DEMO-005",
    name: "Server Aplikasi SIMRS",
    type: "server",
    status: "active",
    criticality: "critical",
    unit: "IT",
    service: "SIMRS",
    owner: "lead",
    location: "Ruang Server Lt.3 - Rack A1",
    warrantyEnd: "2028-01-31",
    notes: "VM aplikasi SIMRS, 8 vCPU / 32 GB RAM.",
  },
  {
    assetNo: "AST-DEMO-006",
    name: "Server Database SIMRS",
    type: "server",
    status: "active",
    criticality: "critical",
    unit: "IT",
    service: "SIMRS",
    owner: "lead",
    location: "Ruang Server Lt.3 - Rack A2",
    warrantyEnd: "2028-01-31",
    notes: "Database PostgreSQL SIMRS dan replika harian.",
  },
  {
    assetNo: "AST-DEMO-007",
    name: "Switch Core Gedung A",
    type: "network",
    status: "active",
    criticality: "critical",
    unit: "IT",
    service: "INFRA",
    owner: "lead",
    location: "Ruang Server Lt.3 - Rack B1",
    warrantyEnd: "2027-09-30",
    notes: "Core switch 48 port, redundan dengan Gedung B.",
  },
  {
    assetNo: "AST-DEMO-008",
    name: "Access Point Rawat Inap Lt.2",
    type: "network",
    status: "active",
    criticality: "high",
    unit: "RANAP",
    service: "INFRA",
    owner: "nurseRanap",
    location: "Rawat Inap Lantai 2 - Koridor",
    warrantyEnd: "2027-02-28",
    notes: "",
  },
  {
    assetNo: "AST-DEMO-009",
    name: "CT Scan 128 Slice",
    type: "medical_device",
    status: "maintenance",
    criticality: "critical",
    unit: "RAD",
    service: "INTEGRASI",
    owner: "radiografer",
    location: "Radiologi - Ruang CT Scan",
    warrantyEnd: "2029-05-31",
    notes: "Integrasi PACS dan DICOM, kalibrasi berkala vendor.",
  },
  {
    assetNo: "AST-DEMO-010",
    name: "Workstation Radiologi",
    type: "workstation",
    status: "active",
    criticality: "high",
    unit: "RAD",
    service: "SIMRS",
    owner: "radiografer",
    location: "Radiologi - Ruang Baca",
    warrantyEnd: "2027-04-30",
    notes: "Dua monitor medis untuk membaca hasil.",
  },
  {
    assetNo: "AST-DEMO-011",
    name: "PC Kasir BPJS 1",
    type: "workstation",
    status: "active",
    criticality: "high",
    unit: "KASIR",
    service: "SIMRS",
    owner: "kasirStaff",
    location: "Loket Kasir 1",
    warrantyEnd: "2027-07-31",
    notes: "",
  },
  {
    assetNo: "AST-DEMO-012",
    name: "Barcode Scanner Laboratorium",
    type: "workstation",
    status: "active",
    criticality: "medium",
    unit: "LAB",
    service: "SIMRS",
    owner: "analystLab",
    location: "Laboratorium - Meja Penerimaan",
    warrantyEnd: "2026-10-31",
    notes: "Scanner 2D untuk label sampel.",
  },
  {
    assetNo: "AST-DEMO-013",
    name: "Printer Hasil Laboratorium",
    type: "printer",
    status: "active",
    criticality: "medium",
    unit: "LAB",
    service: "SIMRS",
    owner: "analystLab",
    location: "Laboratorium - Ruang Hasil",
    warrantyEnd: "2027-01-31",
    notes: "",
  },
  {
    assetNo: "AST-DEMO-014",
    name: "Server Backup",
    type: "server",
    status: "active",
    criticality: "high",
    unit: "IT",
    service: "INFRA",
    owner: "lead",
    location: "Ruang Server Lt.3 - Rack A3",
    warrantyEnd: "2028-03-31",
    notes: "Backup harian SIMRS dan berkas rekam medis.",
  },
  {
    assetNo: "AST-DEMO-015",
    name: "Lisensi Antivirus 50 Seat",
    type: "license",
    status: "active",
    criticality: "medium",
    unit: "IT",
    service: "INFRA",
    owner: "lead",
    location: "Lisensi terpusat",
    warrantyEnd: "2026-12-31",
    notes: "Perpanjangan tahunan, mencakup seluruh workstation.",
  },
  {
    assetNo: "AST-DEMO-016",
    name: "PC Rekam Medis 1",
    type: "workstation",
    status: "active",
    criticality: "medium",
    unit: "RM",
    service: "SIMRS",
    owner: "rmStaff",
    location: "Rekam Medis - Ruang Filing",
    warrantyEnd: "2027-02-28",
    notes: "",
  },
  {
    assetNo: "AST-DEMO-017",
    name: "Monitor Display Antrean Poliklinik",
    type: "workstation",
    status: "active",
    criticality: "low",
    unit: "RAJAL",
    service: "DEVICE",
    owner: "adminRajal",
    location: "Rawat Jalan - Ruang Tunggu",
    warrantyEnd: "2026-09-30",
    notes: "",
  },
  {
    assetNo: "AST-DEMO-018",
    name: "UPS Server",
    type: "server",
    status: "maintenance",
    criticality: "critical",
    unit: "IT",
    service: "INFRA",
    owner: "lead",
    location: "Ruang Server Lt.3 - Rack C1",
    warrantyEnd: "2027-08-31",
    notes: "Baterai mulai lemah, alarm berbunyi saat beban tinggi.",
  },
  {
    assetNo: "AST-DEMO-019",
    name: "Printer Antrean Poliklinik",
    type: "printer",
    status: "active",
    criticality: "high",
    unit: "RAJAL",
    service: "DEVICE",
    owner: "adminRajal",
    location: "Rawat Jalan - Loket Antrean",
    warrantyEnd: "2027-05-31",
    notes: "",
  },
  {
    assetNo: "AST-DEMO-020",
    name: "Scanner Barcode Farmasi",
    type: "workstation",
    status: "active",
    criticality: "high",
    unit: "FARMASI",
    service: "SIMRS",
    owner: "apoteker",
    location: "Farmasi - Depo Rawat Jalan",
    warrantyEnd: "2026-12-31",
    notes: "",
  },
  {
    assetNo: "AST-DEMO-021",
    name: "Workstation Laboratorium",
    type: "workstation",
    status: "active",
    criticality: "medium",
    unit: "LAB",
    service: "SIMRS",
    owner: "analystLab",
    location: "Laboratorium - Analis",
    warrantyEnd: "2027-01-31",
    notes: "",
  },
  {
    assetNo: "AST-DEMO-022",
    name: "PC Manajemen (lama)",
    type: "workstation",
    status: "retired",
    criticality: "low",
    unit: "MGT",
    service: "LAINNYA",
    owner: "mgtStaff",
    location: "Gudang IT",
    warrantyEnd: "2024-12-31",
    notes: "Sudah dinonaktifkan, menunggu penghapusan aset.",
  },
];

export const INTAKE_POINTS = [
  {
    name: "IGD - Triase",
    unit: "IGD",
    location: "IGD, dekat meja triase",
    maxPerHour: 15,
  },
  {
    name: "Rawat Inap - Nurse Station Lt.2",
    unit: "RANAP",
    location: "Rawat Inap lantai 2, koridor nurse station",
    maxPerHour: 12,
  },
  {
    name: "Radiologi - Ruang Tunggu CT Scan",
    unit: "RAD",
    location: "Radiologi, ruang tunggu CT Scan",
    maxPerHour: 8,
  },
];

export const TICKET_STORIES = [
  {
    key: "simrs-pendaftaran",
    type: "incident",
    impact: "clinical_workflow",
    unit: "IGD",
    service: "SIMRS",
    category: "SIMRS-PENDAFTARAN",
    title: "SIMRS error saat pendaftaran pasien BPJS",
    description:
      "Saat menyimpan pendaftaran pasien BPJS, SIMRS menampilkan pesan error dan data pendaftaran tidak tersimpan. Pendaftaran pasien umum masih normal. Loket IGD terpaksa mencatat manual sementara.",
    location: "IGD - Loket Pendaftaran 1",
    asset: "AST-DEMO-001",
    assignee: "resolverApp",
    comments: [
      {
        by: "requester",
        text: "Error muncul sejak sekitar pukul 08.10. Sudah dicoba ulang tiga kali, tetap gagal saat simpan.",
      },
      {
        by: "support",
        text: "Terima kasih laporannya. Kami cek log aplikasi dan koneksi bridging BPJS dulu, mohon ditunggu.",
      },
      {
        by: "assignee",
        visibility: "internal",
        text: "Log menunjukkan timeout ke layanan bridging BPJS. Sementara pendaftaran dialihkan lewat menu cadangan.",
      },
    ],
    resolution: {
      code: "workaround",
      summary:
        "Koneksi bridging BPJS diarahkan ke endpoint cadangan dan layanan di-restart. Pendaftaran kembali normal, pemantauan dilakukan sampai sore.",
    },
  },
  {
    key: "printer-antrean-rajal",
    type: "incident",
    impact: "operational",
    unit: "RAJAL",
    service: "DEVICE",
    category: "INFRA",
    title: "Printer antrean poliklinik tidak mencetak nomor",
    description:
      "Printer antrean di loket poliklinik tidak mengeluarkan nomor sejak pagi. Layar antrean tetap berjalan, tetapi pasien tidak menerima kertas nomor.",
    location: "Rawat Jalan - Loket Antrean",
    asset: "AST-DEMO-019",
    assignee: "resolverHw",
    comments: [
      {
        by: "requester",
        text: "Kertas thermal sudah diganti, tetap tidak keluar. Lampu printer berkedip merah.",
      },
      {
        by: "support",
        text: "Kami jadwalkan teknisi ke lokasi. Sementara nomor dicetak dari printer sekretariat.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Roller printer kotor dan adaptor daya tidak stabil. Roller dibersihkan, adaptor diganti, dan uji cetak berhasil.",
    },
  },
  {
    key: "simrs-lambat",
    type: "incident",
    impact: "clinical_workflow",
    unit: "KASIR",
    service: "SIMRS",
    category: "SIMRS-KASIR",
    title: "SIMRS melambat saat jam sibuk pendaftaran",
    description:
      "Akses SIMRS di loket kasir sangat lambat antara pukul 09.00-11.00. Halaman pembayaran butuh lebih dari satu menit untuk terbuka, antrean pasien menumpuk.",
    location: "Loket Kasir 1-3",
    assignee: "support2",
    comments: [
      {
        by: "requester",
        text: "Lambatnya hanya di jam sibuk. Pagi sebelum pukul 08.00 masih normal.",
      },
      {
        by: "support2",
        text: "Kami pantau query dan beban server. Mohon informasikan bila ada modul tertentu yang paling lambat.",
      },
    ],
    resolution: {
      code: "workaround",
      summary:
        "Ditemukan query laporan yang berjalan berulang dari salah satu klien. Proses tersebut dihentikan dan pemakaian memori server turun.",
    },
  },
  {
    key: "hasil-lab-simrs",
    type: "incident",
    impact: "clinical_workflow",
    unit: "LAB",
    service: "SIMRS",
    category: "SIMRS-LAB",
    title: "Hasil laboratorium tidak masuk ke SIMRS",
    description:
      "Hasil pemeriksaan laboratorium selesai di analyzer, tetapi tidak muncul di SIMRS. Dokter tidak bisa membuka hasil dari rekam medis pasien.",
    location: "Laboratorium - Ruang Hasil",
    asset: "AST-DEMO-021",
    assignee: "resolverApp",
    comments: [
      {
        by: "requester",
        text: "Sudah dicoba kirim ulang dari analyzer, hasilnya tetap tidak masuk.",
      },
      {
        by: "assignee",
        visibility: "internal",
        text: "Antrean interface laboratorium penuh sejak pukul 07.30. Sedang kami bersihkan dan pantau pengiriman ulang.",
      },
      {
        by: "support",
        text: "Kami minta tim lab mengirim ulang hasil untuk pasien yang tertunda setelah antrean bersih.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Layanan interface laboratorium restart, antrean lama dibersihkan, dan hasil dikirim ulang. Seluruh hasil tertunda sudah tampil di SIMRS.",
    },
  },
  {
    key: "monitor-poli",
    type: "incident",
    impact: "convenience",
    unit: "RAJAL",
    service: "DEVICE",
    category: "INFRA",
    title: "Monitor antrean poliklinik menampilkan layar hitam",
    description:
      "Monitor display antrean di ruang tunggu poliklinik hitam total. Petugas memanggil pasien secara manual.",
    location: "Rawat Jalan - Ruang Tunggu",
    asset: "AST-DEMO-017",
    assignee: "resolverHw",
    comments: [
      {
        by: "requester",
        text: "Kabel HDMI sudah dicek dan dicolok ulang, layar tetap hitam.",
      },
      {
        by: "support",
        text: "Kami siapkan monitor cadangan agar pemanggilan pasien tetap berjalan.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Adaptor monitor rusak. Monitor diganti unit cadangan dan display antrean kembali normal.",
    },
  },
  {
    key: "barcode-farmasi",
    type: "incident",
    impact: "operational",
    unit: "FARMASI",
    service: "DEVICE",
    category: "SIMRS-FARMASI",
    title: "Barcode scanner farmasi tidak bisa membaca label obat",
    description:
      "Scanner barcode di depo farmasi berhenti membaca label resep. Petugas harus mengetik nomor resep satu per satu sehingga pelayanan obat melambat.",
    location: "Farmasi - Depo Rawat Jalan",
    asset: "AST-DEMO-020",
    assignee: "resolverHw",
    comments: [
      {
        by: "requester",
        text: "Scanner berbunyi tetapi tidak ada kode yang terbaca di SIMRS.",
      },
      {
        by: "support",
        text: "Kami coba ganti kabel dan pasang scanner cadangan dulu, sambil menunggu pemeriksaan.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Kabel USB scanner rusak dan mode scanner berubah ke keyboard layout yang salah. Kabel dan konfigurasi diperbaiki, uji scan berhasil.",
    },
  },
  {
    key: "wifi-ranap",
    type: "incident",
    impact: "operational",
    unit: "RANAP",
    service: "INFRA",
    category: "INFRA",
    title: "Wi-Fi rawat inap lantai 2 terputus",
    description:
      "Perangkat tablet visite dokter tidak bisa terhubung ke Wi-Fi rawat inap lantai 2 sejak pukul 06.30. Akses lantai 1 dan 3 normal.",
    location: "Rawat Inap Lantai 2",
    asset: "AST-DEMO-008",
    assignee: "resolverNet",
    comments: [
      {
        by: "requester",
        text: "SSID muncul tetapi tidak bisa mendapat IP. Sudah dicoba di beberapa tablet.",
      },
      {
        by: "assignee",
        visibility: "internal",
        text: "Access point lantai 2 tidak merespons ping. Kemungkinan kabel PoE atau AP-nya mati.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Kabel PoE di jalur lantai 2 longgar. Kabel dikencangkan dan AP menyala kembali; koneksi diuji dari dua tablet.",
    },
  },
  {
    key: "simrs-down",
    type: "incident",
    impact: "patient_safety",
    unit: "KASIR",
    service: "SIMRS",
    category: "SIMRS-KASIR",
    title: "Server SIMRS tidak dapat diakses seluruh unit",
    description:
      "Seluruh unit melaporkan tidak bisa membuka SIMRS. Halaman login berputar lalu timeout. Pendaftaran, kasir, farmasi, dan rekam medis terhenti; layanan dialihkan ke prosedur manual.",
    location: "Seluruh unit",
    asset: "AST-DEMO-005",
    assignee: "resolverDb",
    comments: [
      {
        by: "requester",
        text: "Sejak pukul 10.05 semua loket tidak bisa masuk. Mohon segera ditangani, pasien menumpuk.",
      },
      {
        by: "support",
        text: "Insiden sedang ditangani. Mohon gunakan form manual dan catat nomor pasien untuk input ulang.",
      },
      {
        by: "lead",
        text: "Tim aplikasi dan database sedang memeriksa server. Update berikutnya dalam 15 menit.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Disk server aplikasi penuh akibat log yang tidak berotasi. Log diarsipkan, kapasitas dibebaskan, dan layanan SIMRS dinyalakan kembali. Seluruh unit sudah bisa login.",
    },
  },
  {
    key: "satusehat-gagal",
    type: "incident",
    impact: "clinical_workflow",
    unit: "RM",
    service: "INTEGRASI",
    category: "APP-LAIN",
    title: "Sinkronisasi SATUSEHAT gagal sejak pagi",
    description:
      "Data kunjungan pasien tidak terkirim ke SATUSEHAT. Log integrasi mencatat kegagalan autentikasi berulang pada antrean pengiriman.",
    location: "Rekam Medis - Ruang Kerja",
    assignee: "resolverApp",
    comments: [
      {
        by: "requester",
        text: "Antrean pengiriman menumpuk. Apakah aman dilanjutkan nanti atau harus dikirim ulang manual?",
      },
      {
        by: "assignee",
        visibility: "internal",
        text: "Token integrasi kedaluwarsa. Sedang diperbarui bersama vendor, data tetap tersimpan di antrean lokal.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Token integrasi diperbarui, antrean dikirim ulang bertahap, dan seluruh kunjungan hari ini berhasil tersinkron.",
    },
  },
  {
    key: "antrean-bpjs",
    type: "incident",
    impact: "operational",
    unit: "KASIR",
    service: "INTEGRASI",
    category: "SIMRS-KASIR",
    title: "Nomor antrean BPJS tidak muncul di loket",
    description:
      "Pasien dengan antrean BPJS tidak muncul di layar loket, padahal sudah mengambil nomor. Kasir harus memanggil berdasarkan daftar kertas.",
    location: "Loket Kasir BPJS",
    assignee: "resolverApp",
    comments: [
      {
        by: "requester",
        text: "Hanya antrean BPJS yang bermasalah, antrean umum normal.",
      },
      {
        by: "support",
        text: "Kami koordinasi dengan petugas antrean dan vendor bridging. Mohon kirimkan contoh nomor antrean yang gagal.",
      },
    ],
    resolution: {
      code: "workaround",
      summary:
        "Sinkronisasi antrean BPJS diarahkan ke tabel lokal sementara. Nomor antrean kembali tampil dan dipantau hingga penutupan layanan.",
    },
  },
  {
    key: "pc-kasir-login",
    type: "incident",
    impact: "operational",
    unit: "KASIR",
    service: "DEVICE",
    category: "INFRA",
    title: "PC kasir tidak bisa login Windows",
    description:
      "PC kasir menampilkan pesan profil pengguna tidak dapat dimuat saat login. Kasir menggunakan PC cadangan sementara.",
    location: "Loket Kasir 2",
    asset: "AST-DEMO-011",
    assignee: "resolverHw",
    comments: [
      {
        by: "requester",
        text: "Sudah restart dua kali, tetap muncul pesan yang sama.",
      },
      {
        by: "assignee",
        visibility: "internal",
        text: "Profil Windows korup setelah update. Data pengguna dipindahkan ke profil baru.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Profil Windows pengguna diperbaiki dengan membuat profil baru dan memindahkan berkas kerja. Kasir kembali memakai PC aslinya.",
    },
  },
  {
    key: "printer-label-farmasi",
    type: "incident",
    impact: "operational",
    unit: "FARMASI",
    service: "DEVICE",
    category: "SIMRS-FARMASI",
    title: "Printer label obat salah cetak ukuran",
    description:
      "Label obat keluar dengan ukuran tidak sesuai template, sebagian teks terpotong. Petugas menulis nama pasien manual.",
    location: "Farmasi - Depo Rawat Inap",
    asset: "AST-DEMO-004",
    assignee: "resolverHw",
    comments: [
      {
        by: "requester",
        text: "Sejak ganti roll label baru hasilnya bergeser dan terpotong.",
      },
      {
        by: "support",
        text: "Kami kirim teknisi untuk mengatur ulang kalibrasi printer.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Kalibrasi printer diulang dan ukuran label disesuaikan dengan template SIMRS. Uji cetak tiga label berhasil.",
    },
  },
  {
    key: "backup-gagal",
    type: "incident",
    impact: "operational",
    unit: "IT",
    service: "SIMRS",
    category: "INFRA",
    title: "Backup database SIMRS gagal tiga hari berturut-turut",
    description:
      "Notifikasi email backup harian berstatus gagal sejak Senin. Server backup melaporkan ruang penyimpanan penuh.",
    location: "Ruang Server Lt.3",
    asset: "AST-DEMO-014",
    assignee: "resolverDb",
    comments: [
      {
        by: "requester",
        text: "Perlu dicek sebelum akhir minggu, karena audit meminta bukti backup harian.",
      },
      {
        by: "assignee",
        visibility: "internal",
        text: "Disk backup 90% penuh. Saya hapus arsip lama sesuai retensi 30 hari lalu jalankan ulang.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Arsip backup lebih dari 30 hari dibersihkan, rotasi diperbaiki, dan backup manual berhasil. Backup otomatis berikutnya berjalan normal.",
    },
  },
  {
    key: "ct-pacs",
    type: "incident",
    impact: "patient_safety",
    unit: "RAD",
    service: "INTEGRASI",
    category: "SIMRS-RAD",
    title: "CT Scan tidak terhubung ke PACS",
    description:
      "Hasil CT Scan tidak terkirim ke PACS sehingga dokter tidak bisa membuka gambar. Pemeriksaan tetap berjalan tetapi pembacaan tertunda.",
    location: "Radiologi - Ruang CT Scan",
    asset: "AST-DEMO-009",
    assignee: "resolverBio",
    comments: [
      {
        by: "requester",
        text: "Mesin CT menyelesaikan pemeriksaan, tetapi daftar di PACS kosong.",
      },
      {
        by: "support",
        text: "Kami hubungi vendor alat dan tim jaringan. Mohon siapkan foto pesan error di layar CT.",
      },
      {
        by: "assignee",
        visibility: "internal",
        text: "Koneksi DICOM dari CT ke server PACS terputus. Port jaringan di ruang CT sedang dicek.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Port jaringan ruang CT direset oleh tim jaringan. Koneksi DICOM pulih, gambar dikirim ulang dan seluruh pemeriksaan tertunda sudah terbaca.",
    },
  },
  {
    key: "email-notif",
    type: "incident",
    impact: "convenience",
    unit: "MGT",
    service: "LAINNYA",
    category: "APP-LAIN",
    title: "Email notifikasi tiket tidak diterima",
    description:
      "Beberapa pengguna melaporkan tidak menerima email notifikasi tiket, meskipun notifikasi in-app muncul. SMTP mengembalikan pesan antrean.",
    location: "Manajemen - Ruang Kerja",
    assignee: "support",
    comments: [
      {
        by: "requester",
        text: "Email dari sistem masuk ke folder spam bagi sebagian penerima.",
      },
      {
        by: "support",
        text: "Kami periksa konfigurasi SPF dan antrean email, lalu kirim ulang notifikasi yang tertunda.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Konfigurasi pengirim diperbaiki dan antrean email dikirim ulang. Penerima diminta menandai pengirim sebagai bukan spam.",
    },
  },
  {
    key: "wifi-poli",
    type: "incident",
    impact: "convenience",
    unit: "RAJAL",
    service: "INFRA",
    category: "INFRA",
    title: "Wi-Fi ruang tunggu poliklinik sangat lambat",
    description:
      "Wi-Fi untuk pasien di ruang tunggu poliklinik sangat lambat pada jam sibuk. Aplikasi pendaftaran mandiri sering gagal memuat.",
    location: "Rawat Jalan - Ruang Tunggu",
    assignee: "resolverNet",
    comments: [
      {
        by: "requester",
        text: "Banyak pasien mengeluh tidak bisa membuka aplikasi pendaftaran online.",
      },
      {
        by: "support",
        text: "Kami batasi bandwidth jaringan tamu dan prioritaskan jaringan operasional.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Pembatasan bandwidth jaringan tamu diterapkan dan channel access point diubah. Koneksi pendaftaran mandiri kembali lancar.",
    },
  },
  {
    key: "rekam-medis-error",
    type: "incident",
    impact: "clinical_workflow",
    unit: "RM",
    service: "SIMRS",
    category: "SIMRS-RM",
    title: "Aplikasi rekam medis error saat menyimpan resume",
    description:
      "Saat menyimpan resume medis pasien pulang, aplikasi menampilkan error 500. Dokter harus mengulang pengisian dari awal.",
    location: "Rekam Medis - Ruang Dokter",
    assignee: "resolverApp",
    comments: [
      {
        by: "requester",
        text: "Kejadian pada dua pasien berbeda. Error muncul setelah menekan tombol simpan.",
      },
      {
        by: "assignee",
        visibility: "internal",
        text: "Ada kolom baru yang kosong pada salah satu template resume. Saya perbaiki validasi simpan.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Validasi kolom resume diperbaiki dan template diisi nilai default. Simpan resume berhasil pada uji ulang.",
    },
  },
  {
    key: "ups-alarm",
    type: "incident",
    impact: "operational",
    unit: "IT",
    service: "INFRA",
    category: "INFRA",
    title: "UPS ruang server berbunyi alarm",
    description:
      "UPS di ruang server berbunyi alarm dan lampu indikator baterai berkedip. Server masih menyala normal tetapi perlu pemeriksaan.",
    location: "Ruang Server Lt.3",
    asset: "AST-DEMO-018",
    assignee: "resolverNet",
    comments: [
      {
        by: "requester",
        text: "Alarm berbunyi sejak pukul 13.00, tidak berhenti setelah tombol tes ditekan.",
      },
      {
        by: "assignee",
        visibility: "internal",
        text: "Baterai UPS sudah di bawah kapasitas. Saya minta pengadaan baterai pengganti dan pantau beban listrik.",
      },
    ],
    resolution: {
      code: "workaround",
      summary:
        "Beban UPS dipindahkan sementara ke jalur listrik cadangan dan alarm dimatikan. Penggantian baterai dijadwalkan minggu depan.",
    },
  },

  // ------------------------- Service request -------------------------
  {
    key: "reset-password",
    type: "service_request",
    impact: "operational",
    unit: "IGD",
    service: "ACCESS",
    item: "RESET-PASSWORD",
    category: "APP-LAIN",
    title: "Reset password akun SIMRS perawat baru",
    description:
      "Perawat baru IGD lupa password akun SIMRS dan tidak bisa mengakses rekam medis pasien. Mohon reset password dan kirimkan password sementara.",
    location: "IGD",
    assignee: "support",
    comments: [
      {
        by: "requester",
        text: "Akun atas nama Ns. Dewi Anggraini, NIP 2024.118. Mohon dibantu hari ini.",
      },
      {
        by: "support",
        text: "Password sementara sudah dikirim melalui pesan internal. Wajib diganti saat login pertama.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Password akun direset, pengguna sudah berhasil login, dan diminta mengganti password saat login berikutnya.",
    },
  },
  {
    key: "akun-baru-lab",
    type: "service_request",
    impact: "operational",
    unit: "LAB",
    service: "ACCESS",
    item: "AKUN-BARU",
    category: "APP-LAIN",
    title: "Permintaan akun SIMRS untuk analis laboratorium baru",
    description:
      "Ada analis baru yang mulai Senin dan membutuhkan akun SIMRS dengan akses modul laboratorium serta hasil pemeriksaan.",
    location: "Laboratorium",
    assignee: "support",
    comments: [
      {
        by: "requester",
        text: "Nama: Andi Nugroho, NIP 2026.045. Mohon akun aktif sebelum Senin pagi.",
      },
      {
        by: "support",
        text: "Akun sudah dibuat, menunggu persetujuan akses modul dari Kepala IT sesuai SOP.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Akun SIMRS dibuat dengan akses laboratorium sesuai permintaan dan kredensial diserahkan ke unit.",
    },
  },
  {
    key: "akses-rm",
    type: "service_request",
    impact: "operational",
    unit: "RM",
    service: "ACCESS",
    item: "AKSES-TAMBAH",
    category: "SIMRS-RM",
    title: "Tambah akses modul rekam medis untuk staf baru",
    description:
      "Staf rekam medis baru membutuhkan akses modul peminjaman berkas dan input kode diagnosis, di luar akses dasar yang sudah dimiliki.",
    location: "Rekam Medis",
    assignee: "support",
    comments: [
      {
        by: "requester",
        text: "Akses saat ini hanya baca. Mohon tambahkan izin peminjaman berkas dan koreksi kode diagnosis.",
      },
      {
        by: "support",
        text: "Menunggu persetujuan manajer unit untuk penambahan hak akses.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Hak akses modul rekam medis ditambahkan sesuai persetujuan manajer unit dan diuji oleh pengguna.",
    },
  },
  {
    key: "perbaikan-printer-rad",
    type: "service_request",
    impact: "operational",
    unit: "RAD",
    service: "DEVICE",
    item: "PERBAIKAN-PERANGKAT",
    category: "INFRA",
    title: "Perbaikan printer pencetak hasil radiologi",
    description:
      "Printer hasil radiologi menimbulkan garis hitam pada hasil cetak. Mohon diperiksa dan dibersihkan.",
    location: "Radiologi - Ruang Cetak",
    asset: "AST-DEMO-010",
    assignee: "resolverHw",
    comments: [
      {
        by: "requester",
        text: "Garis muncul di bagian kanan hasil cetak, makin lama makin jelas.",
      },
      {
        by: "support",
        text: "Teknisi dijadwalkan besok pagi. Sementara hasil dicetak dari printer cadangan.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Drum printer dibersihkan dan toner diganti. Hasil uji cetak bersih tanpa garis.",
    },
  },
  {
    key: "lisensi-antivirus",
    type: "service_request",
    impact: "convenience",
    unit: "MGT",
    service: "LAINNYA",
    category: "APP-LAIN",
    title: "Perpanjangan lisensi antivirus 50 seat",
    description:
      "Lisensi antivirus akan berakhir bulan depan. Mohon diajukan perpanjangan untuk 50 seat workstation rumah sakit.",
    location: "Manajemen",
    asset: "AST-DEMO-015",
    assignee: "support",
    comments: [
      {
        by: "requester",
        text: "Mohon diajukan sebelum tanggal berakhir agar tidak ada workstation tanpa proteksi.",
      },
      {
        by: "support",
        text: "Permintaan sudah diteruskan ke bagian pengadaan, menunggu persetujuan anggaran.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Lisensi diperpanjang untuk 50 seat dan kode aktivasi baru dipasang ke seluruh workstation.",
    },
  },
  {
    key: "ram-workstation",
    type: "service_request",
    impact: "operational",
    unit: "RAD",
    service: "DEVICE",
    item: "PERBAIKAN-PERANGKAT",
    category: "INFRA",
    title: "Upgrade RAM workstation radiologi",
    description:
      "Workstation pembaca gambar radiologi sering macet saat membuka banyak citra. Mohon upgrade RAM dari 8 GB ke 16 GB.",
    location: "Radiologi - Ruang Baca",
    asset: "AST-DEMO-010",
    assignee: "resolverHw",
    comments: [
      {
        by: "requester",
        text: "Macet terutama saat membuka dua pemeriksaan sekaligus.",
      },
      {
        by: "support",
        text: "RAM pengganti tersedia di gudang IT, penjadwalan penggantian besok pagi.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "RAM workstation dinaikkan ke 16 GB, memori kosong terpantau normal, dan pengujian membuka citra berjalan lancar.",
    },
  },
  {
    key: "konfigurasi-simrs",
    type: "service_request",
    impact: "operational",
    unit: "KASIR",
    service: "SIMRS",
    item: "PERUBAHAN-KONFIG",
    category: "SIMRS-KASIR",
    title: "Perubahan format cetak kwitansi SIMRS",
    description:
      "Format cetak kwitansi perlu ditambah logo rumah sakit dan kolom nomor SEP BPJS agar sesuai kebijakan baru.",
    location: "Kasir",
    assignee: "resolverApp",
    comments: [
      {
        by: "requester",
        text: "Contoh format baru sudah kami lampirkan ke bagian keuangan, mohon disamakan.",
      },
      {
        by: "support",
        text: "Perubahan konfigurasi memerlukan persetujuan Kepala IT karena memengaruhi dokumen resmi.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Template kwitansi diperbarui dengan logo dan kolom SEP, lalu diuji cetak di dua loket kasir.",
    },
  },
  {
    key: "akun-email",
    type: "service_request",
    impact: "operational",
    unit: "MGT",
    service: "ACCESS",
    item: "AKUN-BARU",
    category: "APP-LAIN",
    title: "Permintaan akun email untuk staf manajemen baru",
    description:
      "Staf manajemen baru membutuhkan akun email rumah sakit untuk korespondensi resmi dan kalender rapat.",
    location: "Manajemen",
    assignee: "support",
    comments: [
      {
        by: "requester",
        text: "Mohon dibuatkan email dengan format nama depan.nama belakang.",
      },
      {
        by: "support",
        text: "Akun email dibuat setelah persetujuan manajer unit. Mohon konfirmasi nama lengkap.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Akun email dibuat, distribusi grup kalender ditambahkan, dan kredensial diserahkan ke pengguna.",
    },
  },
  {
    key: "jaringan-poli-baru",
    type: "service_request",
    impact: "operational",
    unit: "RAJAL",
    service: "INFRA",
    item: "PERUBAHAN-JARINGAN",
    category: "INFRA",
    title: "Pemasangan jaringan untuk poli baru",
    description:
      "Poli baru di lantai 1 membutuhkan dua titik jaringan untuk komputer pendaftaran dan printer.",
    location: "Rawat Jalan - Poli Baru",
    assignee: "resolverNet",
    comments: [
      {
        by: "requester",
        text: "Poli mulai beroperasi minggu depan, mohon jaringan selesai sebelum uji coba.",
      },
      {
        by: "support",
        text: "Survei lokasi sudah dilakukan, penarikan kabel dijadwalkan Kamis.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Dua titik jaringan dipasang, dites dengan komputer pendaftaran dan printer, koneksi stabil.",
    },
  },

  // -------------------------- Change request --------------------------
  {
    key: "upgrade-bandwidth",
    type: "change_request",
    impact: "operational",
    unit: "MGT",
    service: "INFRA",
    item: "PERUBAHAN-JARINGAN",
    category: "INFRA",
    title: "Upgrade bandwidth internet utama gedung A",
    description:
      "Pemakaian internet gedung A mendekati kapasitas pada jam sibuk. Diusulkan upgrade bandwidth dari 200 Mbps ke 400 Mbps.",
    location: "Gedung A",
    changeRisk: "medium",
    changePlan:
      "Koordinasikan dengan ISP untuk upgrade jalur, jadwalkan di luar jam layanan, uji throughput setelah aktivasi.",
    rollbackPlan:
      "Bila upgrade mengganggu koneksi, kembalikan konfigurasi jalur lama dan hubungi ISP untuk rollback.",
    assignee: "resolverNet",
    comments: [
      {
        by: "requester",
        text: "Pemakaian rata-rata 180 Mbps pada pukul 10.00-14.00.",
      },
      {
        by: "support",
        text: "Perubahan sudah dijadwalkan Sabtu malam agar tidak mengganggu layanan.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Bandwidth dinaikkan menjadi 400 Mbps, throughput terukur 390 Mbps, dan pemantauan tiga hari tidak menemukan gangguan.",
    },
  },
  {
    key: "patch-server",
    type: "change_request",
    impact: "clinical_workflow",
    unit: "IT",
    service: "SIMRS",
    category: "INFRA",
    title: "Patch keamanan server SIMRS",
    description:
      "Server SIMRS perlu patch keamanan darurat dari vendor. Diperkirakan butuh restart layanan di luar jam sibuk.",
    location: "Ruang Server Lt.3",
    changeRisk: "high",
    changePlan:
      "Ambil snapshot server, terapkan patch pada jendela pemeliharaan pukul 22.00, restart layanan, lalu uji login dan modul utama.",
    rollbackPlan:
      "Bila layanan gagal menyala setelah patch, kembalikan ke snapshot sebelum patch dan laporkan ke vendor.",
    assignee: "resolverDb",
    comments: [
      {
        by: "requester",
        text: "Patch ini wajib karena ada kerentanan kritis yang diumumkan vendor.",
      },
      {
        by: "lead",
        text: "Approval CAB diperlukan karena risiko tinggi dan layanan berhenti sementara.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Patch diterapkan pada jendela pemeliharaan, layanan restart normal, dan seluruh modul utama lolos uji pasca-patch.",
    },
  },
  {
    key: "migrasi-db",
    type: "change_request",
    impact: "clinical_workflow",
    unit: "IT",
    service: "SIMRS",
    category: "INFRA",
    title: "Migrasi database SIMRS ke server baru",
    description:
      "Database SIMRS akan dipindahkan ke server baru dengan penyimpanan lebih besar. Perlu rencana pemeliharaan dan uji pasca migrasi.",
    location: "Ruang Server Lt.3",
    changeRisk: "high",
    changePlan:
      "Sinkronisasi replika, hentikan layanan sementara, pindahkan data, arahkan koneksi aplikasi, lalu uji integritas dan modul kritis.",
    rollbackPlan:
      "Bila integritas data gagal, arahkan aplikasi kembali ke server lama dan ulangi migrasi pada jadwal berikutnya.",
    assignee: "resolverDb",
    comments: [
      {
        by: "requester",
        text: "Mohon jadwalkan di akhir pekan agar layanan tidak terganggu.",
      },
      {
        by: "lead",
        text: "Tim aplikasi diminta standby saat cutover dan uji login setelah migrasi.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Migrasi selesai pada jendela pemeliharaan, verifikasi jumlah data dan uji modul kritis berhasil, aplikasi berjalan di server baru.",
    },
  },
  {
    key: "modul-farmasi",
    type: "change_request",
    impact: "operational",
    unit: "FARMASI",
    service: "SIMRS",
    item: "PERUBAHAN-KONFIG",
    category: "SIMRS-FARMASI",
    title: "Aktivasi modul stok farmasi baru",
    description:
      "Modul stok farmasi baru akan diaktifkan untuk depo rawat inap. Perlu konfigurasi gudang dan uji transaksi.",
    location: "Farmasi",
    changeRisk: "medium",
    changePlan:
      "Konfigurasi gudang dan satuan, migrasikan stok awal, uji transaksi penerimaan dan pengeluaran, lalu aktifkan untuk petugas.",
    rollbackPlan:
      "Nonaktifkan modul dan kembalikan pencatatan ke aplikasi lama bila ditemukan selisih stok yang tidak bisa diselesaikan.",
    assignee: "resolverApp",
    comments: [
      {
        by: "requester",
        text: "Stok awal sudah dihitung ulang oleh tim farmasi.",
      },
      {
        by: "support",
        text: "Uji coba modul dijadwalkan bersama apoteker depo rawat inap.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Modul stok aktif, stok awal termigrasi, dan uji penerimaan serta pengeluaran obat berhasil.",
    },
  },
  {
    key: "switch-core",
    type: "change_request",
    impact: "patient_safety",
    unit: "IT",
    service: "INFRA",
    category: "INFRA",
    title: "Penggantian switch core gedung A",
    description:
      "Switch core lama sudah berusia delapan tahun dan mulai sering restart. Diusulkan penggantian dengan perangkat baru.",
    location: "Ruang Server Lt.3 - Rack B1",
    changeRisk: "high",
    changePlan:
      "Siapkan konfigurasi paralel, jadwalkan cutover di luar jam layanan, pindahkan kabel bertahap, lalu uji seluruh VLAN.",
    rollbackPlan:
      "Simpan switch lama dalam kondisi siap; bila uji VLAN gagal, kembalikan kabel ke switch lama.",
    assignee: "resolverNet",
    comments: [
      {
        by: "requester",
        text: "Switch restart sendiri dua kali bulan ini dan sempat memutus seluruh gedung A.",
      },
      {
        by: "lead",
        text: "Perubahan risiko tinggi, perlu CAB dan dokumentasi rollback lengkap.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "Switch core diganti, seluruh VLAN diuji, dan jaringan gedung A stabil tanpa restart selama pemantauan satu minggu.",
    },
  },
  {
    key: "vlan-radiologi",
    type: "change_request",
    impact: "operational",
    unit: "RAD",
    service: "INFRA",
    item: "PERUBAHAN-JARINGAN",
    category: "INFRA",
    title: "Penyesuaian VLAN perangkat radiologi",
    description:
      "Perangkat radiologi akan dipindahkan ke VLAN khusus agar lalu lintas citra tidak mengganggu jaringan umum.",
    location: "Radiologi",
    changeRisk: "low",
    changePlan:
      "Buat VLAN baru, daftarkan port perangkat radiologi, uji koneksi ke PACS, lalu pantau trafik.",
    rollbackPlan:
      "Kembalikan port ke VLAN lama bila perangkat tidak dapat terhubung ke PACS.",
    assignee: "resolverNet",
    comments: [
      {
        by: "requester",
        text: "Pemindahan diusulkan agar transfer citra CT tidak lambat.",
      },
      {
        by: "support",
        text: "Perubahan dijadwalkan setelah jam pemeriksaan.",
      },
    ],
    resolution: {
      code: "fixed",
      summary:
        "VLAN radiologi aktif, perangkat terhubung ke PACS, dan transfer citra terpantau lebih stabil.",
    },
  },
];

export const PROBLEMS = [
  {
    key: "koneksi-simrs",
    title: "Koneksi SIMRS terputus berkala di area pendaftaran",
    description:
      "Beberapa laporan menunjukkan koneksi SIMRS di area pendaftaran terputus sesaat lalu pulih sendiri. Pola ini muncul pada jam sibuk dan mengganggu input pendaftaran.",
    service: "SIMRS",
    status: "known_error",
    rootCause:
      "Port switch lantai 1 mengalami flapping akibat kabel patch yang longgar dan benturan kursi troli.",
    workaround:
      "Pindahkan workstation ke port switch cadangan atau gunakan koneksi Wi-Fi cadangan sementara waktu.",
    permanentFix: "",
    linkStories: ["simrs-pendaftaran", "simrs-lambat"],
    ageDays: 21,
  },
  {
    key: "server-lambat",
    title: "Server SIMRS melambat pada jam sibuk",
    description:
      "Beban server aplikasi meningkat pada pukul 09.00-11.00. Beberapa modul membutuhkan waktu lebih lama untuk merespons.",
    service: "SIMRS",
    status: "investigating",
    rootCause:
      "Dugaan awal: query laporan berjalan berulang dan pemakaian memori tinggi pada jam sibuk.",
    workaround: "",
    permanentFix: "",
    linkStories: ["simrs-lambat"],
    ageDays: 12,
  },
  {
    key: "printer-offline",
    title: "Printer thermal antrean sering offline",
    description:
      "Printer thermal antrean di beberapa unit sering offline setelah beberapa jam pemakaian. Perangkat perlu dicabut dan dinyalakan ulang.",
    service: "DEVICE",
    status: "closed",
    rootCause:
      "Adaptor daya tidak stabil dan driver printer yang dipakai sudah usang.",
    workaround:
      "Cabut adaptor, tunggu 10 detik, lalu nyalakan ulang printer dan cetak ulang nomor.",
    permanentFix:
      "Adaptor diganti dengan unit resmi dan driver diperbarui ke versi terbaru di seluruh printer antrean.",
    linkStories: ["printer-antrean-rajal", "printer-label-farmasi"],
    ageDays: 35,
  },
  {
    key: "satusehat",
    title: "Sinkronisasi SATUSEHAT gagal beberapa kali sehari",
    description:
      "Pengiriman data kunjungan ke SATUSEHAT gagal dengan pesan autentikasi. Antrean lokal menumpuk dan dikirim ulang setelah token diperbarui.",
    service: "INTEGRASI",
    status: "identified",
    rootCause: "",
    workaround:
      "Kirim ulang antrean dari menu integrasi setelah token diperbarui.",
    permanentFix: "",
    linkStories: ["satusehat-gagal"],
    ageDays: 6,
  },
  {
    key: "backup",
    title: "Backup database SIMRS gagal berulang",
    description:
      "Backup harian SIMRS gagal karena ruang penyimpanan server backup penuh dan rotasi arsip tidak berjalan.",
    service: "INFRA",
    status: "resolved",
    rootCause:
      "Skrip rotasi backup tidak menghapus arsip lama setelah perubahan path penyimpanan.",
    workaround: "Hapus arsip manual sebelum menjalankan backup.",
    permanentFix:
      "Skrip rotasi diperbaiki, retensi 30 hari diterapkan, dan kapasitas disk ditambah.",
    linkStories: ["backup-gagal"],
    ageDays: 28,
  },
  {
    key: "antrean-bpjs",
    title: "Antrean BPJS tidak sinkron dengan layar loket",
    description:
      "Nomor antrean BPJS tidak selalu muncul di layar loket walaupun pasien sudah mengambil nomor. Diduga ada masalah pada layanan sinkronisasi.",
    service: "INTEGRASI",
    status: "resolved",
    rootCause:
      "Layanan sinkronisasi antrean kehilangan koneksi ke database antrean pusat.",
    workaround: "Gunakan daftar kertas antrean sementara.",
    permanentFix:
      "Layanan sinkronisasi dipasang ulang dengan pemeriksaan koneksi otomatis.",
    linkStories: ["antrean-bpjs"],
    ageDays: 45,
  },
];

export const ARTICLES = [
  {
    key: "sop-reset-password",
    title: "SOP Reset Password Akun SIMRS",
    body:
      "<p>Prosedur reset password akun SIMRS untuk staf rumah sakit.</p><ul><li>Verifikasi identitas pengguna melalui unit atau atasan langsung.</li><li>Reset password dari menu Tim atau menu pengguna SIMRS.</li><li>Serahkan password sementara melalui saluran internal, bukan grup umum.</li><li>Minta pengguna mengganti password saat login pertama.</li></ul>",
    visibility: "public",
    status: "published",
    tags: "simrs, akun, password",
    service: "ACCESS",
    ageDays: 40,
  },
  {
    key: "cara-lapor-qr",
    title: "Cara Melaporkan Gangguan IT Lewat QR di Unit",
    body:
      "<p>Setiap unit memiliki titik QR untuk melaporkan gangguan tanpa login.</p><ol><li>Pindai QR yang tertempel di unit.</li><li>Isi nama dan kontak yang bisa dihubungi.</li><li>Pilih layanan dan jelaskan gangguan secara singkat.</li><li>Tekan kirim dan catat nomor tiket yang muncul.</li></ol><p>Lampiran berupa tangkapan layar sangat membantu tim IT.</p>",
    visibility: "public",
    status: "published",
    tags: "qr, intake, pelaporan",
    service: "LAINNYA",
    ageDays: 33,
  },
  {
    key: "known-error-printer",
    title: "Known Error: Printer Thermal Antrean Offline",
    body:
      "<p>Gejala: printer antrean tidak mencetak, lampu berkedip, atau layar antrean tidak bergerak.</p><p>Workaround: cabut adaptor daya, tunggu 10 detik, nyalakan ulang, lalu cetak ulang nomor dari menu antrean.</p><p>Bila berulang, ajukan penggantian adaptor ke tim hardware.</p>",
    visibility: "internal",
    status: "published",
    tags: "printer, antrean, known error",
    service: "DEVICE",
    problem: "printer-offline",
    ageDays: 30,
  },
  {
    key: "sop-restart-simrs",
    title: "SOP Restart Layanan SIMRS di Server Aplikasi",
    body:
      "<p>Langkah restart layanan SIMRS saat terjadi gangguan menyeluruh:</p><ol><li>Pastikan ada persetujuan Kepala IT dan jendela pemeliharaan.</li><li>Umumkan penghentian layanan ke unit melalui kanal resmi.</li><li>Hentikan layanan, tunggu proses selesai, lalu nyalakan kembali.</li><li>Uji login, pendaftaran, farmasi, dan kasir.</li></ol>",
    visibility: "internal",
    status: "published",
    tags: "simrs, server, sop",
    service: "SIMRS",
    ageDays: 55,
  },
  {
    key: "panduan-bpjs",
    title: "Panduan Akses Aplikasi BPJS VClaim",
    body:
      "<p>Akses VClaim memerlukan akun dan hak akses dari unit kasir BPJS.</p><ul><li>Gunakan jaringan internal, bukan Wi-Fi tamu.</li><li>Periksa masa berlaku kredensial setiap awal bulan.</li><li>Laporkan kegagalan login ke tim integrasi dengan menyertakan waktu kejadian.</li></ul>",
    visibility: "internal",
    status: "published",
    tags: "bpjs, vclaim, integrasi",
    service: "INTEGRASI",
    ageDays: 48,
  },
  {
    key: "known-error-satusehat",
    title: "Known Error: Sinkronisasi SATUSEHAT Gagal",
    body:
      "<p>Gejala: data kunjungan tidak terkirim ke SATUSEHAT, antrean integrasi menumpuk, dan muncul pesan autentikasi.</p><p>Workaround: perbarui token integrasi, lalu kirim ulang antrean dari menu integrasi.</p><p>Bila masih gagal, laporkan ke tim integrasi dengan menyertakan log antrean.</p>",
    visibility: "internal",
    status: "published",
    tags: "satusehat, integrasi, known error",
    service: "INTEGRASI",
    problem: "satusehat",
    ageDays: 25,
  },
  {
    key: "sop-backup",
    title: "SOP Backup dan Restore Database SIMRS",
    body:
      "<p>Backup database dijalankan setiap hari pukul 01.00 dan disimpan maksimal 30 hari.</p><ol><li>Periksa status backup pada dashboard server backup.</li><li>Bila gagal, periksa kapasitas penyimpanan dan log skrip.</li><li>Uji restore ke server latihan minimal satu kali per bulan.</li></ol>",
    visibility: "internal",
    status: "published",
    tags: "backup, database, sop",
    service: "INFRA",
    problem: "backup",
    ageDays: 18,
  },
  {
    key: "panduan-ct",
    title: "Panduan Perawatan Harian CT Scan",
    body:
      "<p>Perawatan harian alat CT Scan meliputi pemeriksaan suhu ruangan, kebersihan gantry, dan uji koneksi ke PACS sebelum pemeriksaan pertama.</p><p>Hubungi teknisi alat kesehatan bila muncul kode error pada layar operasi.</p>",
    visibility: "internal",
    status: "review",
    tags: "ct scan, alat kesehatan, perawatan",
    service: "INTEGRASI",
    ageDays: 4,
  },
  {
    key: "draft-aset",
    title: "Draft: Standar Penamaan Aset IT",
    body:
      "<p>Dokumen ini menyusun standar penamaan aset IT rumah sakit, termasuk format kode lokasi dan unit.</p><p>Masih dalam pembahasan dengan manajemen aset.</p>",
    visibility: "internal",
    status: "draft",
    tags: "aset, standar, draft",
    service: "LAINNYA",
    ageDays: 2,
  },
  {
    key: "vpn-lama",
    title: "Panduan Penggunaan VPN Kantor (Usang)",
    body:
      "<p>Panduan lama penggunaan VPN kantor sebelum migrasi ke akses berbasis identitas. Dokumen ini sudah tidak berlaku.</p><p>Gunakan panduan akses terbaru dari tim jaringan.</p>",
    visibility: "internal",
    status: "retired",
    tags: "vpn, lama, usang",
    service: "INFRA",
    ageDays: 120,
  },
];

export const INCIDENTS = [
  {
    key: "koneksi-pendaftaran",
    title: "Gangguan koneksi SIMRS di gedung pendaftaran",
    description:
      "Koneksi SIMRS di gedung pendaftaran terputus bergantian pada beberapa workstation. Layanan dialihkan sementara ke prosedur manual.",
    severity: "sev2",
    status: "closed",
    impactSummary:
      "Pendaftaran dan kasir melambat selama kurang lebih 45 menit, layanan klinis tetap berjalan dengan prosedur manual.",
    services: ["SIMRS", "INFRA"],
    commander: "lead",
    linkStories: ["simrs-pendaftaran", "simrs-lambat"],
    resolutionSummary:
      "Kabel patch pada port switch lantai 1 diganti dan port dikunci. Koneksi seluruh workstation pendaftaran pulih dan dipantau selama 24 jam.",
    rootCause:
      "Kabel patch longgar dan port switch mengalami flapping saat troli melewati jalur kabel.",
    pirActions:
      "Ganti kabel patch yang longgar, pasang pengunci port, dan tambahkan pemeriksaan kabel pada maintenance bulanan.",
    updates: [
      {
        kind: "update",
        visibility: "internal",
        body: "Tim jaringan sedang memeriksa switch lantai 1. Unit pendaftaran diminta memakai form manual sementara.",
      },
      {
        kind: "communication",
        visibility: "public",
        body: "Pendaftaran sementara dilayani manual. Kami akan mengumumkan kembali setelah layanan normal.",
      },
      {
        kind: "decision",
        visibility: "internal",
        body: "Port switch dorsi yang flapping diganti dan dikunci. Uji koneksi berhasil di lima workstation.",
      },
    ],
    ageDays: 18,
    resolvedDaysAgo: 17.5,
  },
  {
    key: "simrs-total",
    title: "SIMRS tidak dapat diakses seluruh unit",
    description:
      "Seluruh unit melaporkan tidak bisa membuka SIMRS. Tim IT menetapkan insiden mayor dan menjalankan prosedur pemulihan layanan.",
    severity: "sev1",
    status: "investigating",
    impactSummary:
      "Pendaftaran, kasir, farmasi, dan rekam medis terhenti. Layanan pasien memakai prosedur manual.",
    services: ["SIMRS"],
    commander: "lead",
    linkStories: ["simrs-down"],
    resolutionSummary: "",
    rootCause: "",
    pirActions: "",
    updates: [
      {
        kind: "update",
        visibility: "internal",
        body: "Tim aplikasi dan database memeriksa penggunaan disk dan proses database. Mohon tidak melakukan restart mendadak.",
      },
      {
        kind: "communication",
        visibility: "public",
        body: "Layanan SIMRS sedang dalam pemulihan. Pendaftaran dilayani manual sementara waktu.",
      },
    ],
    ageDays: 0.3,
    resolvedDaysAgo: null,
  },
  {
    key: "wifi-ranap",
    title: "Wi-Fi rawat inap lantai 2 terputus",
    description:
      "Access point rawat inap lantai 2 tidak aktif sehingga tablet visite tidak bisa terhubung.",
    severity: "sev3",
    status: "resolved",
    impactSummary:
      "Visite dokter menggunakan kertas sementara selama kurang lebih 30 menit.",
    services: ["INFRA"],
    commander: "lead2",
    linkStories: ["wifi-ranap"],
    resolutionSummary:
      "Kabel PoE dikencangkan dan access point menyala kembali. Koneksi diuji dari dua tablet visite.",
    rootCause: "Kabel PoE pada jalur lantai 2 longgar.",
    pirActions: "",
    updates: [
      {
        kind: "update",
        visibility: "internal",
        body: "AP lantai 2 tidak merespons. Tim jaringan menuju lokasi.",
      },
    ],
    ageDays: 7,
    resolvedDaysAgo: 6.9,
  },
  {
    key: "ct-pacs-incident",
    title: "Koneksi CT Scan ke PACS terputus",
    description:
      "CT Scan menyelesaikan pemeriksaan tetapi citra tidak terkirim ke PACS sehingga pembacaan hasil tertunda.",
    severity: "sev2",
    status: "mitigating",
    impactSummary:
      "Pembacaan hasil CT tertunda sekitar satu jam; pemeriksaan pasien tetap berjalan.",
    services: ["INTEGRASI"],
    commander: "lead",
    linkStories: ["ct-pacs"],
    resolutionSummary: "",
    rootCause: "",
    pirActions: "",
    updates: [
      {
        kind: "update",
        visibility: "internal",
        body: "Koneksi DICOM terputus di port jaringan ruang CT. Tim jaringan sedang memeriksa.",
      },
      {
        kind: "communication",
        visibility: "public",
        body: "Pemeriksaan CT tetap berjalan. Pembacaan hasil akan menyusul setelah koneksi PACS pulih.",
      },
    ],
    ageDays: 0.2,
    resolvedDaysAgo: null,
  },
];
