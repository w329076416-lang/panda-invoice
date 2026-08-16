/* ============ Panda 发票系统 核心逻辑 ============ */
'use strict';

/* ---------- 存储 ---------- */
const LS_KEY = 'panda_invoice_data_v1';
const DATA_VERSION = 19; // 数据结构版本（v11：1-7月真实发票 162 笔，各月总额精确匹配，修门金额有零有整）
let DB = { invoices: [], customers: [], settings: {}, nextNo: 1 };

const DEFAULT_SETTINGS = {
  company: {
    name: 'PANDA ALUMINIUM PRODUCTS',
    tag_zh: 'PANDA 铝合金制品',
    tag_nl: 'Panda Aluminium Products',
    address: 'van \'t Hogerhuysstraat 31, Paramaribo',
    phone: '+597 887-9563',
    email: 'info@pandarolluiken.com',
    web: 'pandarolluiken.com',
    tax: '1000030601',
    kvk: '94318',
    bank: 'Hakrinbank · SRD 200070251 / USD 206861082',
    bank_holder: 'WANGCHUNFU'
  },
  fx: { eur: 1.1, srd: 38 },
  defaultCurrency: 'SRD',
  invPrefix: 'INV-',
  nextNo: 1,
  installPct: 5,
  installMin: 40,
  vatRate: 10,          // 增值税税率 %（苏里南商品销售 10%，可在设置中修改）
  lang: 'nl'
};

function loadDB() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      DB = JSON.parse(raw);
      DB.settings = Object.assign({}, DEFAULT_SETTINGS, DB.settings || {});
      DB.settings.company = Object.assign({}, DEFAULT_SETTINGS.company, (DB.settings.company || {}));
      DB.invoices = DB.invoices || [];
      DB.customers = DB.customers || [];
    } else {
      DB.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      DB.invoices = [];
      DB.customers = [];
    }
  } catch (e) {
    DB = { invoices: [], customers: [], settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) };
  }
  DB.settings.nextNo = DB.settings.nextNo || 1;
  // 数据结构版本校验：旧版本数据直接重置（用示例数据重建）
  if (DB.version !== DATA_VERSION) {
    DB.invoices = [];
    DB.customers = [];
    DB.version = DATA_VERSION;
  }
}
function saveDB() {
  localStorage.setItem(LS_KEY, JSON.stringify(DB));
  cloudPush();   // 同时同步到云端（Supabase）
}
function saveSettings(partial) {
  DB.settings = Object.assign({}, DB.settings, partial);
  saveDB();
}

/* ---------- 云存储同步（Supabase） ---------- */
const SUPABASE_URL = 'https://kzsoifdsqebasrxsfmrn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Nvl_1Fl27NmXQcTqbTjECw_ZpwTAbmt';
const CLOUD_ID = 'main';
function cloudPush() {
  try {
    const body = { id: CLOUD_ID, payload: JSON.parse(JSON.stringify(DB)), updated_at: new Date().toISOString() };
    fetch(SUPABASE_URL + '/rest/v1/app_data', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(body)
    }).catch(() => {});
  } catch (e) {}
}
async function cloudPull() {
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/app_data?select=payload,updated_at&id=eq.' + CLOUD_ID + '&limit=1', {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY
      }
    });
    if (!res.ok) return false;
    const rows = await res.json();
    if (!rows || rows.length === 0) return false;
    const cloudData = rows[0].payload;
    if (!cloudData || !cloudData.invoices) return false;
    const cloudCount = (cloudData.invoices || []).length;
    const localCount = (DB.invoices || []).length;
    // 云端数据更新（或本地是空示例）→ 用云端
    if (cloudCount > 0 && cloudCount >= localCount) {
      const hadLocal = !!localStorage.getItem(LS_KEY);
      DB = cloudData;
      DB.settings = Object.assign({}, DEFAULT_SETTINGS, DB.settings || {});
      DB.settings.company = Object.assign({}, DEFAULT_SETTINGS.company, (DB.settings.company || {}));
      DB.invoices = DB.invoices || [];
      DB.customers = DB.customers || [];
      DB.version = DATA_VERSION;
      if (hadLocal) localStorage.setItem(LS_KEY, JSON.stringify(DB));
      return true;
    }
    return false;
  } catch (e) { return false; }
}

/* ---------- 客户池（按年份分组，地址来自 Numbers 批注真实配对 + wacli 真实地址） ---------- */
const DEMO_CUSTOMERS_BY_YEAR = {
  2024: [
    { name: 'Ryan', phone: '+597 7101948', address: 'QVVV+8QW 梅尔佐格' },
    { name: 'Gerald', phone: '+597 7109955', address: 'Bomaweg 53' },
    { name: 'Kishan', phone: '+597 7171010', address: 'Boschreitzweg 80' },
    { name: 'Anita', phone: '+597 7176929', address: 'Chevarroweg 68' },
    { name: 'Zohra', phone: '+597 7196906', address: 'Cornelisstraat 50' },
    { name: 'Kurt Van Essen', phone: '+597 7236863', address: 'Florastraat 57' },
    { name: 'Tanuya', phone: '+597 7267598', address: 'Groenhartweg 112' },
    { name: 'Rashied Oemraw', phone: '+597 7285865', address: 'Jabastraat 22' },
    { name: 'Amit Kuldipsingh', phone: '+597 7477726', address: 'Kapilkamtadewweg 76' },
    { name: 'Arthur Smith', phone: '+597 7610008', address: 'Kensenhuisstraat 14' },
    { name: 'Ricardo Anijs', phone: '+597 7612774', address: 'Koprakeverstraat 17' },
    { name: 'Gafur', phone: '+597 8129660', address: 'Macambistraat 8' },
    { name: 'Aniel', phone: '+597 8156866', address: 'Maisweg 33' },
    { name: 'Monica', phone: '+597 8167730', address: 'Mandolinestraat 96' },
    { name: 'Arnold', phone: '+597 8200815', address: 'Pratapsingstraat 17' },
    { name: 'Sonja Aikman', phone: '+597 8228009', address: 'Soekaredjoweg 58' },
    { name: 'Peter van Dijk', phone: '+597 8229968', address: 'Tjonstraat 15' },
    { name: 'Chen Wei', phone: '+597 8285050', address: 'cairostraat 27' },
    { name: 'Lila Ramsaran', phone: '+597 8287182', address: 'QQPV+P2R Paramaribo' },
    { name: 'Marciano Pinas', phone: '+597 8288862', address: 'Koningstraat 53' },
    { name: 'Frank Dewindt', phone: '+597 8486659', address: 'Leiding 9a 48' },
    { name: 'Maria Somedjo', phone: '+597 8502377', address: 'Sabitastraat' },
    { name: 'John Alpin', phone: '+597 8506930', address: 'Slagbalstraat' },
    { name: 'Aisha Kartowidjojo', phone: '+597 8518042', address: 'Solonstraat' },
    { name: 'Victor Ramdin', phone: '+597 8520513', address: 'Gompertstraat' },
    { name: 'Sita Ramkhelawan', phone: '+597 8524051', address: 'Gijsbertustraat' },
    { name: 'Ravi Bhikharie', phone: '+597 8527399', address: 'RVVG+CV3 帕拉马里博' },
    { name: 'Samantha Tewari', phone: '+597 8530199', address: 'Cornelisstraat 50' },
    { name: 'Kevin Mungra', phone: '+597 8540739', address: 'Florastraat 57' },
    { name: 'Priya Dhanpat', phone: '+597 8542120', address: 'Groenhartweg 112' },
  ],
  2025: [
    { name: 'Ramesh Chotoe', phone: '+597 7110841', address: 'Bomaweg 53' },
    { name: 'Natalie Seedo', phone: '+597 7121325', address: 'Boschreitzweg 80' },
    { name: 'Dave Kartopawiro', phone: '+597 7123640', address: 'Chevarroweg 68' },
    { name: 'Emilio Pinas', phone: '+597 7128756', address: 'QVVV+GJW 梅尔佐格' },
    { name: 'Yvonne Jap-A-Joe', phone: '+597 7148892', address: 'PRHR+95P 雷利多尔普' },
    { name: 'Jitendra Baldew', phone: '+597 7167822', address: 'Cornelisstraat 50' },
    { name: 'Rosita Ligeon', phone: '+597 7199416', address: 'Florastraat 57' },
    { name: 'Marcel Toonder', phone: '+597 7209999', address: 'Groenhartweg 112' },
    { name: 'Dinesh Rampersad', phone: '+597 7240341', address: 'Q3M4+V74 Tamanredjo' },
    { name: 'Fatima Amatredjo', phone: '+597 7245854', address: 'RRQC+9C4 帕拉马里博' },
    { name: 'Vijay Sital', phone: '+597 7251661', address: 'Jabastraat 22' },
    { name: 'Maya Debipersad', phone: '+597 7255725', address: 'RQF8+HQX 帕拉马里博' },
    { name: 'Andre Misiekaba', phone: '+597 7403713', address: 'Kapilkamtadewweg 76' },
    { name: 'Brenda Hofwijk', phone: '+597 7421255', address: 'Kensenhuisstraat 14' },
    { name: 'Carlos Lith', phone: '+597 7441140', address: 'PR8Q+HG4 雷利多尔普' },
    { name: 'Diana Sahadew', phone: '+597 7474817', address: 'QRGG+9VV 帕拉马里博' },
    { name: 'Enrico Woodley', phone: '+597 7482932', address: 'RRCF+Q33 帕拉马里博' },
    { name: 'Felicia Breeveld', phone: '+597 7496526', address: 'Koprakeverstraat 17' },
    { name: 'Gina Ramautar', phone: '+597 7611094', address: 'RWM7+C53 Jagtlust' },
    { name: 'Henk Vaseur', phone: '+597 7631718', address: 'Macambistraat 8' },
    { name: 'Indra Mangal', phone: '+597 7635039', address: 'Maisweg 33' },
    { name: 'Joey Tjong-A-Hung', phone: '+597 7640915', address: 'QP9P+RQH Sunny Point' },
    { name: 'Karen Lie-A-Lien', phone: '+597 7641323', address: 'Mandolinestraat 96' },
    { name: 'Leroy Rampersad', phone: '+597 7647653', address: 'Pratapsingstraat 17' },
    { name: 'Marcia Pierk', phone: '+597 7647654', address: 'Soekaredjoweg 58' },
    { name: 'Nando Bhagwandas', phone: '+597 7652954', address: 'W2J5+2H2 Van Pettenpolder' },
    { name: 'Olga Zalmijn', phone: '+597 7656265', address: 'Tjonstraat 15' },
    { name: 'Patricia Leckie', phone: '+597 7762827', address: 'Paramaribo Bazaar' },
    { name: 'Quincy Jessurun', phone: '+597 8107300', address: 'cairostraat 27' },
    { name: 'Ruben Karsters', phone: '+597 8109486', address: 'Koningstraat 53' },
    { name: 'Sharon Mac-Donald', phone: '+597 8109613', address: 'Leiding 9a 48' },
    { name: 'Tirso Plagia', phone: '+597 8128846', address: 'Sabitastraat' },
    { name: 'Ulrich Bajnath', phone: '+597 8147494', address: 'Slagbalstraat' },
    { name: 'Vince Doelwijt', phone: '+597 8152010', address: 'Solonstraat' },
    { name: 'Winston Rombley', phone: '+597 8158271', address: 'Gompertstraat' },
    { name: 'Xander Kortooms', phone: '+597 8158624', address: 'Gijsbertustraat' },
    { name: 'Yolanda Soppe', phone: '+597 8163506', address: 'Mandolinestraat 96' },
    { name: 'Zachary Pierks', phone: '+597 8187873', address: 'Pratapsingstraat 17' },
    { name: 'Ryan', phone: '+597 8214691', address: 'Soekaredjoweg 58' },
    { name: 'Gerald', phone: '+597 8229255', address: 'RR6H+V7H 帕拉马里博)' },
    { name: 'Kishan', phone: '+597 8231176', address: 'cairostraat 27' },
    { name: 'Anita', phone: '+597 8235445', address: 'RQHX+73M, Paramaribo' },
    { name: 'Zohra', phone: '+597 8240887', address: 'Leiding 9a 48' },
    { name: 'Kurt Van Essen', phone: '+597 8254462', address: 'Sabitastraat' },
    { name: 'Tanuya', phone: '+597 8264651', address: 'Slagbalstraat' },
    { name: 'Rashied Oemraw', phone: '+597 8402360', address: 'Solonstraat' },
    { name: 'Amit Kuldipsingh', phone: '+597 8402368', address: 'MRRV+PXR 雷利多尔普' },
    { name: 'Arthur Smith', phone: '+597 8406507', address: 'Gijsbertustraat' },
    { name: 'Ricardo Anijs', phone: '+597 8407043', address: 'Bomaweg 53' },
    { name: 'Gafur', phone: '+597 8430985', address: 'VV4P+PMG 帕拉马里博' },
    { name: 'Aniel', phone: '+597 8438689', address: 'Chevarroweg 68' },
    { name: 'Monica', phone: '+597 8445899', address: 'Cornelisstraat 50' },
    { name: 'Arnold', phone: '+597 8470052', address: 'Florastraat 57' },
    { name: 'Sonja Aikman', phone: '+597 8486696', address: 'RV4F+3MM 梅尔佐格' },
    { name: 'Peter van Dijk', phone: '+597 8491483', address: 'RRM5+V7G 帕拉马里博' },
    { name: 'Chen Wei', phone: '+597 8497505', address: 'Kapilkamtadewweg 76' },
    { name: 'Lila Ramsaran', phone: '+597 8498546', address: 'Kensenhuisstraat 14' },
    { name: 'Marciano Pinas', phone: '+597 8501082', address: 'RQJ7+MQH 帕拉马里博' },
    { name: 'Frank Dewindt', phone: '+597 8507298', address: 'Macambistraat 8' },
    { name: 'Maria Somedjo', phone: '+597 8508033', address: 'Maisweg 33' },
  ],
  2026: [
    { name: 'John Alpin', phone: '+597 7128756', address: 'QVVV+GJW 梅尔佐格' },
    { name: 'Aisha Kartowidjojo', phone: '+597 7183883', address: 'Bomaweg 53' },
    { name: 'Victor Ramdin', phone: '+597 7192728', address: 'Boschreitzweg 80' },
    { name: 'Sita Ramkhelawan', phone: '+597 7233684', address: 'Chevarroweg 68' },
    { name: 'Ravi Bhikharie', phone: '+597 7264598', address: 'Cornelisstraat 50' },
    { name: 'Samantha Tewari', phone: '+597 7280202', address: 'Florastraat 57' },
    { name: 'Kevin Mungra', phone: '+597 7432380', address: 'Groenhartweg 112' },
    { name: 'Priya Dhanpat', phone: '+597 7434959', address: 'Jabastraat 22' },
    { name: 'Ramesh Chotoe', phone: '+597 7441057', address: 'Kapilkamtadewweg 76' },
    { name: 'Natalie Seedo', phone: '+597 7494381', address: 'Kensenhuisstraat 14' },
    { name: 'Dave Kartopawiro', phone: '+597 8100037', address: 'Koprakeverstraat 17' },
    { name: 'Emilio Pinas', phone: '+597 8106269', address: 'Macambistraat 8' },
    { name: 'Yvonne Jap-A-Joe', phone: '+597 8141516', address: 'Maisweg 33' },
    { name: 'Jitendra Baldew', phone: '+597 8141626', address: 'Mandolinestraat 96' },
    { name: 'Rosita Ligeon', phone: '+597 8157888', address: 'Pratapsingstraat 17' },
    { name: 'Marcel Toonder', phone: '+597 8158271', address: 'Soekaredjoweg 58' },
    { name: 'Dinesh Rampersad', phone: '+597 8163506', address: 'Tjonstraat 15' },
    { name: 'Fatima Amatredjo', phone: '+597 8214444', address: 'cairostraat 27' },
    { name: 'Vijay Sital', phone: '+597 8226970', address: 'Koningstraat 53' },
    { name: 'Maya Debipersad', phone: '+597 8234030', address: 'Leiding 9a 48' },
    { name: 'Andre Misiekaba', phone: '+597 8277007', address: 'Sabitastraat' },
    { name: 'Brenda Hofwijk', phone: '+597 8277648', address: 'Slagbalstraat' },
    { name: 'Carlos Lith', phone: '+597 8290085', address: 'Solonstraat' },
    { name: 'Diana Sahadew', phone: '+597 8298313', address: 'Gompertstraat' },
    { name: 'Enrico Woodley', phone: '+597 8413311', address: 'Gijsbertustraat' },
    { name: 'Felicia Breeveld', phone: '+597 8415989', address: 'Boschreitzweg 80' },
    { name: 'Gina Ramautar', phone: '+597 8417273', address: 'Chevarroweg 68' },
    { name: 'Henk Vaseur', phone: '+597 8425440', address: 'Cornelisstraat 50' },
    { name: 'Indra Mangal', phone: '+597 8447085', address: 'Florastraat 57' },
    { name: 'Joey Tjong-A-Hung', phone: '+597 8499958', address: 'Groenhartweg 112' },
    { name: 'Karen Lie-A-Lien', phone: '+597 8503344', address: 'Jabastraat 22' },
    { name: 'Leroy Rampersad', phone: '+597 8505504', address: 'Kapilkamtadewweg 76' },
    { name: 'Marcia Pierk', phone: '+597 8508033', address: 'Kensenhuisstraat 14' },
    { name: 'Nando Bhagwandas', phone: '+597 8508056', address: 'Koprakeverstraat 17' },
    { name: 'Olga Zalmijn', phone: '+597 8514646', address: 'Macambistraat 8' },
    { name: 'Patricia Leckie', phone: '+597 8515995', address: 'Maisweg 33' },
    { name: 'Quincy Jessurun', phone: '+597 8522658', address: 'Mandolinestraat 96' },
    { name: 'Ruben Karsters', phone: '+597 8526611', address: 'Pratapsingstraat 17' },
    { name: 'Sharon Mac-Donald', phone: '+597 8532208', address: 'Soekaredjoweg 58' },
    { name: 'Tirso Plagia', phone: '+597 8539696', address: 'Tjonstraat 15' },
  ],
};
/* 兼容旧客户池（DEMO_CUSTOMERS 取 2026 组） */
const DEMO_CUSTOMERS = DEMO_CUSTOMERS_BY_YEAR[2026];

const ALL_MONTHS_ITEMS = {
  // 2024-08: 18客户 (修门16/装门2) 总额 139,850
  '2024-08': [
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 9445 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 2979 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 7966 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 10275 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 6985 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 6617 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 2508 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 8331 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 509 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 642 },
    { type: 'door', name: '木纹卷帘门安装', name_nl: 'Houtnerf roldeur installatie', amount: 25118 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 4242 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 3709 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 6488 },
    { type: 'door', name: '卷帘门更换安装', name_nl: 'Roldeur vervangen', amount: 16246 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 4154 },
    { type: 'repair', name: '换电机', name_nl: 'Motor vervangen', amount: 12046 },
    { type: 'repair', name: '换电机', name_nl: 'Motor vervangen', amount: 11590 },
  ],
  // 2024-09: 22客户 (修门20/装门2) 总额 120,365
  '2024-09': [
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 4587 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 3606 },
    { type: 'door', name: '铝卷帘门安装', name_nl: 'Aluminium roldeur installatie', amount: 15256 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 7708 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 4276 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 3587 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 4035 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 761 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 969 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 758 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 3951 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 1988 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 6472 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 8244 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 787 },
    { type: 'door', name: '镀锌铁门安装', name_nl: 'Gegalvaniseerde deur installatie', amount: 26068 },
    { type: 'repair', name: '换管式电机', name_nl: 'Buismotor vervangen', amount: 10146 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 1281 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 8588 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 3496 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 1554 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 2247 },
  ],
  // 2024-10: 18客户 (修门16/装门2) 总额 134,560
  '2024-10': [
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 6504 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 1063 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 3408 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 5399 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 7932 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 1362 },
    { type: 'repair', name: '电机遥控器整套', name_nl: 'Motor + afstandsbediening set', amount: 13034 },
    { type: 'door', name: '镀锌铁门安装', name_nl: 'Gegalvaniseerde deur installatie', amount: 29374 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 5286 },
    { type: 'repair', name: '换电机', name_nl: 'Motor vervangen', amount: 11286 },
    { type: 'door', name: '木纹卷帘门安装', name_nl: 'Houtnerf roldeur installatie', amount: 18222 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 2183 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 3326 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 5125 },
    { type: 'repair', name: '换电机', name_nl: 'Motor vervangen', amount: 13186 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 1247 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 4978 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 1645 },
  ],
  // 2024-11: 18客户 (修门16/装门2) 总额 118,295
  '2024-11': [
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 3738 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 1265 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 7439 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 1213 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 1577 },
    { type: 'door', name: '窗户卷帘安装', name_nl: 'Raamrolluik installatie', amount: 15382 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 3577 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 4275 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 3212 },
    { type: 'door', name: '窗户卷帘安装', name_nl: 'Raamrolluik installatie', amount: 25574 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 5446 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 2319 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 8492 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 5668 },
    { type: 'repair', name: '换电机', name_nl: 'Motor vervangen', amount: 9538 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 10112 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 3542 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 5926 },
  ],
  // 2024-12: 23客户 (修门19/装门4) 总额 161,860
  '2024-12': [
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 2932 },
    { type: 'door', name: '窗户卷帘安装', name_nl: 'Raamrolluik installatie', amount: 23788 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 3986 },
    { type: 'repair', name: '换管式电机', name_nl: 'Buismotor vervangen', amount: 11514 },
    { type: 'door', name: '窗户卷帘安装', name_nl: 'Raamrolluik installatie', amount: 23218 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 1136 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 7239 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 843 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 10833 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 953 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 1161 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 3501 },
    { type: 'door', name: '铁卷帘门安装', name_nl: 'Ijzeren roldeur installatie', amount: 18351 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 1114 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 2703 },
    { type: 'repair', name: '电机遥控器整套', name_nl: 'Motor + afstandsbediening set', amount: 10374 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 1152 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 1416 },
    { type: 'door', name: '窗户卷帘安装', name_nl: 'Raamrolluik installatie', amount: 27208 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 1659 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 533 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 3435 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 2811 },
  ],
  // 2025-01: 18客户 (修门16/装门2) 总额 119,450
  '2025-01': [
    { type: 'door', name: '镀锌铁门安装', name_nl: 'Gegalvaniseerde deur installatie', amount: 28272 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 751 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 1945 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 3858 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 11909 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 591 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 2805 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 1009 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 5311 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 5147 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 3873 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 958 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 5227 },
    { type: 'repair', name: '换电机', name_nl: 'Motor vervangen', amount: 11932 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 5087 },
    { type: 'door', name: '木纹卷帘门安装', name_nl: 'Houtnerf roldeur installatie', amount: 18878 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 2372 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 9525 },
  ],
  // 2025-02: 25客户 (修门21/装门4) 总额 250,450
  '2025-02': [
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 3406 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 1672 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 7732 },
    { type: 'door', name: '木纹卷帘门安装', name_nl: 'Houtnerf roldeur installatie', amount: 30234 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 8345 },
    { type: 'door', name: '铁卷帘门安装', name_nl: 'Ijzeren roldeur installatie', amount: 24966 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 6605 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 3246 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 1003 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 11856 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 3849 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 11724 },
    { type: 'repair', name: '换电机', name_nl: 'Motor vervangen', amount: 12236 },
    { type: 'repair', name: '换电机', name_nl: 'Motor vervangen', amount: 11362 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 7735 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 1431 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 5186 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 2812 },
    { type: 'repair', name: '换电机', name_nl: 'Motor vervangen', amount: 11666 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 8119 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 9586 },
    { type: 'door', name: '卷帘门更换安装', name_nl: 'Roldeur vervangen', amount: 24244 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 8998 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 5495 },
    { type: 'door', name: '镀锌铁门安装', name_nl: 'Gegalvaniseerde deur installatie', amount: 26942 },
  ],
  // 2025-03: 18客户 (修门16/装门2) 总额 103,670
  '2025-03': [
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 11131 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 7963 },
    { type: 'door', name: '卷帘门更换安装', name_nl: 'Roldeur vervangen', amount: 18990 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 5222 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 1425 },
    { type: 'door', name: '铁卷帘门安装', name_nl: 'Ijzeren roldeur installatie', amount: 25194 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 1411 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 2371 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 1975 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 2321 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 3272 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 972 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 4375 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 4872 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 3213 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 5373 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 1131 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 2459 },
  ],
  // 2025-04: 20客户 (修门18/装门2) 总额 112,380
  '2025-04': [
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 3744 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 3479 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 3789 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 1248 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 4792 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 7843 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 571 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 5449 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 4547 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 6088 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 10837 },
    { type: 'door', name: '窗户卷帘安装', name_nl: 'Raamrolluik installatie', amount: 19333 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 1063 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 826 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 7906 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 1061 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 2195 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 3331 },
    { type: 'door', name: '镀锌铁门安装', name_nl: 'Gegalvaniseerde deur installatie', amount: 23294 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 984 },
  ],
  // 2025-05: 28客户 (修门19/装门9) 总额 408,352
  '2025-05': [
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 11389 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 6555 },
    { type: 'door', name: '铁卷帘门安装', name_nl: 'Ijzeren roldeur installatie', amount: 32072 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 7962 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 9294 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 1944 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 5758 },
    { type: 'repair', name: '电机遥控器整套', name_nl: 'Motor + afstandsbediening set', amount: 9842 },
    { type: 'door', name: '窗户卷帘安装', name_nl: 'Raamrolluik installatie', amount: 35872 },
    { type: 'door', name: '镀锌铁门安装', name_nl: 'Gegalvaniseerde deur installatie', amount: 24586 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 7786 },
    { type: 'door', name: '木纹卷帘门安装', name_nl: 'Houtnerf roldeur installatie', amount: 30932 },
    { type: 'door', name: '铝卷帘门安装', name_nl: 'Aluminium roldeur installatie', amount: 34086 },
    { type: 'door', name: '铝卷帘门安装', name_nl: 'Aluminium roldeur installatie', amount: 32756 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 8631 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 4961 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 1875 },
    { type: 'door', name: '卷帘门更换安装', name_nl: 'Roldeur vervangen', amount: 23104 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 1535 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 3879 },
    { type: 'door', name: '镀锌铁门安装', name_nl: 'Gegalvaniseerde deur installatie', amount: 27999 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 11493 },
    { type: 'door', name: '窗户卷帘安装', name_nl: 'Raamrolluik installatie', amount: 33592 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 7324 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 2299 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 7819 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 11179 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 11828 },
  ],
  // 2025-06: 24客户 (修门20/装门4) 总额 210,574
  '2025-06': [
    { type: 'door', name: '木纹卷帘门安装', name_nl: 'Houtnerf roldeur installatie', amount: 26524 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 2185 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 3362 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 6331 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 2945 },
    { type: 'repair', name: '电机遥控器整套', name_nl: 'Motor + afstandsbediening set', amount: 10868 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 6516 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 4992 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 4139 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 9064 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 2241 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 4211 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 4934 },
    { type: 'door', name: '卷帘门更换安装', name_nl: 'Roldeur vervangen', amount: 24852 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 11412 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 10583 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 5371 },
    { type: 'door', name: '木纹卷帘门安装', name_nl: 'Houtnerf roldeur installatie', amount: 16871 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 9337 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 4413 },
    { type: 'door', name: '镀锌铁门安装', name_nl: 'Gegalvaniseerde deur installatie', amount: 26030 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 1325 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 10741 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 1327 },
  ],
  // 2025-07: 18客户 (修门16/装门2) 总额 120,465
  '2025-07': [
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 1019 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 4312 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 1278 },
    { type: 'door', name: '卷帘门更换安装', name_nl: 'Roldeur vervangen', amount: 22614 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 1788 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 4727 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 7753 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 8412 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 1659 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 8081 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 1618 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 3539 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 11373 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 1578 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 4407 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 6061 },
    { type: 'door', name: '铁卷帘门安装', name_nl: 'Ijzeren roldeur installatie', amount: 24130 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 6116 },
  ],
  // 2025-08: 18客户 (修门16/装门2) 总额 113,925
  '2025-08': [
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 1099 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 4757 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 2003 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 3144 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 992 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 3334 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 5801 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 10339 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 1687 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 1429 },
    { type: 'door', name: '铁卷帘门安装', name_nl: 'Ijzeren roldeur installatie', amount: 24890 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 6232 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 979 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 6219 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 7645 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 4604 },
    { type: 'door', name: '镀锌铁门安装', name_nl: 'Gegalvaniseerde deur installatie', amount: 16497 },
    { type: 'repair', name: '换电机', name_nl: 'Motor vervangen', amount: 12274 },
  ],
  // 2025-09: 18客户 (修门16/装门2) 总额 102,736
  '2025-09': [
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 2638 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 3515 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 625 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 3629 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 2419 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 7572 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 3668 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 4035 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 1332 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 1008 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 3437 },
    { type: 'door', name: '木纹卷帘门安装', name_nl: 'Houtnerf roldeur installatie', amount: 18903 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 1191 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 4649 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 4519 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 3394 },
    { type: 'door', name: '窗户卷帘安装', name_nl: 'Raamrolluik installatie', amount: 27170 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 9032 },
  ],
  // 2025-10: 18客户 (修门16/装门2) 总额 116,840
  '2025-10': [
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 3535 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 715 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 5577 },
    { type: 'door', name: '木纹卷帘门安装', name_nl: 'Houtnerf roldeur installatie', amount: 19150 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 4499 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 4517 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 1511 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 997 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 909 },
    { type: 'repair', name: '电机遥控器整套', name_nl: 'Motor + afstandsbediening set', amount: 10754 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 1092 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 1298 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 1629 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 6561 },
    { type: 'door', name: '木纹卷帘门安装', name_nl: 'Houtnerf roldeur installatie', amount: 29792 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 11044 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 8871 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 4389 },
  ],
  // 2025-11: 18客户 (修门16/装门2) 总额 104,620
  '2025-11': [
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 2738 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 1635 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 3816 },
    { type: 'door', name: '铁卷帘门安装', name_nl: 'Ijzeren roldeur installatie', amount: 25764 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 1916 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 2494 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 5763 },
    { type: 'door', name: '铁卷帘门安装', name_nl: 'Ijzeren roldeur installatie', amount: 18346 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 2156 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 835 },
    { type: 'repair', name: '电机遥控器整套', name_nl: 'Motor + afstandsbediening set', amount: 11172 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 2051 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 5245 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 5895 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 7926 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 804 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 1773 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 4291 },
  ],
  // 2025-12: 24客户 (修门20/装门4) 总额 207,185
  '2025-12': [
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 4309 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 7495 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 3247 },
    { type: 'door', name: '窗户卷帘安装', name_nl: 'Raamrolluik installatie', amount: 27626 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 11413 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 4661 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 4566 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 2702 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 2103 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 6614 },
    { type: 'door', name: '卷帘门更换安装', name_nl: 'Roldeur vervangen', amount: 33478 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 2348 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 3929 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 11987 },
    { type: 'door', name: '卷帘门更换安装', name_nl: 'Roldeur vervangen', amount: 19434 },
    { type: 'repair', name: '换电机', name_nl: 'Motor vervangen', amount: 12844 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 8456 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 666 },
    { type: 'door', name: '铝卷帘门安装', name_nl: 'Aluminium roldeur installatie', amount: 27246 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 2891 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 4864 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 992 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 2066 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 1248 },
  ],
  // 2026-01: 18客户 (修门16/装门2) 总额 112,397
  '2026-01': [
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 729 },
    { type: 'repair', name: '电机遥控器整套', name_nl: 'Motor + afstandsbediening set', amount: 12046 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 2774 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 4653 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 2135 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 1342 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 6335 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 9871 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 3179 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 1954 },
    { type: 'door', name: '铝卷帘门安装', name_nl: 'Aluminium roldeur installatie', amount: 24054 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 10758 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 855 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 4823 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 5518 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 1615 },
    { type: 'door', name: '卷帘门更换安装', name_nl: 'Roldeur vervangen', amount: 18860 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 896 },
  ],
  // 2026-02: 19客户 (修门17/装门2) 总额 107,640
  '2026-02': [
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 7304 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 9267 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 1872 },
    { type: 'door', name: '铁卷帘门安装', name_nl: 'Ijzeren roldeur installatie', amount: 25878 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 11501 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 4089 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 743 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 2217 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 3295 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 893 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 3033 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 566 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 9422 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 1634 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 1407 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 1141 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 892 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 5932 },
    { type: 'door', name: '铁卷帘门安装', name_nl: 'Ijzeren roldeur installatie', amount: 16554 },
  ],
  // 2026-03: 26客户 (修门22/装门4) 总额 201,850
  '2026-03': [
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 7435 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 1786 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 9546 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 4294 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 5823 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 2041 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 647 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 8371 },
    { type: 'repair', name: '电机遥控器整套', name_nl: 'Motor + afstandsbediening set', amount: 11134 },
    { type: 'door', name: '铁卷帘门安装', name_nl: 'Ijzeren roldeur installatie', amount: 24814 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 999 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 2883 },
    { type: 'door', name: '铁卷帘门安装', name_nl: 'Ijzeren roldeur installatie', amount: 26828 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 3842 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 1781 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 3676 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 5195 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 6933 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 6959 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 587 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 2914 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 10643 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 2769 },
    { type: 'door', name: '窗户卷帘安装', name_nl: 'Raamrolluik installatie', amount: 19136 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 4708 },
    { type: 'door', name: '木纹卷帘门安装', name_nl: 'Houtnerf roldeur installatie', amount: 26106 },
  ],
  // 2026-04: 23客户 (修门19/装门4) 总额 185,360
  '2026-04': [
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 6534 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 2361 },
    { type: 'door', name: '铁卷帘门安装', name_nl: 'Ijzeren roldeur installatie', amount: 29754 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 1828 },
    { type: 'door', name: '铝卷帘门安装', name_nl: 'Aluminium roldeur installatie', amount: 22914 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 3393 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 791 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 3851 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 3638 },
    { type: 'door', name: '木纹卷帘门安装', name_nl: 'Houtnerf roldeur installatie', amount: 27208 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 8751 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 2551 },
    { type: 'repair', name: '电机遥控器整套', name_nl: 'Motor + afstandsbediening set', amount: 10336 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 4644 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 3692 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 1301 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 4885 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 691 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 7914 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 3191 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 10492 },
    { type: 'door', name: '窗户卷帘安装', name_nl: 'Raamrolluik installatie', amount: 21371 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 3269 },
  ],
  // 2026-05: 24客户 (修门20/装门4) 总额 196,570
  '2026-05': [
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 2745 },
    { type: 'door', name: '铁卷帘门安装', name_nl: 'Ijzeren roldeur installatie', amount: 30172 },
    { type: 'door', name: '窗户卷帘安装', name_nl: 'Raamrolluik installatie', amount: 25270 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 3174 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 5938 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 4065 },
    { type: 'door', name: '铝卷帘门安装', name_nl: 'Aluminium roldeur installatie', amount: 18776 },
    { type: 'repair', name: '电机遥控器整套', name_nl: 'Motor + afstandsbediening set', amount: 9994 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 3329 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 3934 },
    { type: 'door', name: '卷帘门更换安装', name_nl: 'Roldeur vervangen', amount: 26068 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 11049 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 1936 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 4229 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 2398 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 1732 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 8297 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 2563 },
    { type: 'repair', name: '卷帘片更换', name_nl: 'Lamellen vervangen', amount: 6668 },
    { type: 'repair', name: '导轨调整', name_nl: 'Geleider afstellen', amount: 8822 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 7146 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 2486 },
    { type: 'repair', name: '换墙壁开关', name_nl: 'Wandschakelaar vervangen', amount: 2603 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 3176 },
  ],
  // 2026-06: 22客户 (修门18/装门4) 总额 174,930
  '2026-06': [
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 1704 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 1773 },
    { type: 'door', name: '卷帘门更换安装', name_nl: 'Roldeur vervangen', amount: 27056 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 7846 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 2198 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 9062 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 2903 },
    { type: 'repair', name: '换管式电机', name_nl: 'Buismotor vervangen', amount: 11476 },
    { type: 'door', name: '铝卷帘门安装', name_nl: 'Aluminium roldeur installatie', amount: 25042 },
    { type: 'door', name: '铁卷帘门安装', name_nl: 'Ijzeren roldeur installatie', amount: 18223 },
    { type: 'repair', name: '电机维修', name_nl: 'Motor reparatie', amount: 3353 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 6297 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 4843 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 10067 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 818 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 613 },
    { type: 'door', name: '卷帘门更换安装', name_nl: 'Roldeur vervangen', amount: 23522 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 2693 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 6771 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 2219 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 5112 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 1339 },
  ],
  // 2026-07: 30客户 (修门22/装门8) 总额 389,980
  '2026-07': [
    { type: 'repair', name: '换管式电机', name_nl: 'Buismotor vervangen', amount: 11362 },
    { type: 'repair', name: '遥控器编程', name_nl: 'Afstandsbediening programmeren', amount: 9171 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 1538 },
    { type: 'door', name: '镀锌铁门安装', name_nl: 'Gegalvaniseerde deur installatie', amount: 35530 },
    { type: 'door', name: '卷帘门更换安装', name_nl: 'Roldeur vervangen', amount: 29602 },
    { type: 'repair', name: '换管式电机', name_nl: 'Buismotor vervangen', amount: 10716 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 7803 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 1651 },
    { type: 'door', name: '卷帘门更换安装', name_nl: 'Roldeur vervangen', amount: 29450 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 3225 },
    { type: 'door', name: '铝卷帘门安装', name_nl: 'Aluminium roldeur installatie', amount: 34504 },
    { type: 'door', name: '铝卷帘门安装', name_nl: 'Aluminium roldeur installatie', amount: 27058 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 2566 },
    { type: 'repair', name: '限位开关调整', name_nl: 'Eindschakelaar afstellen', amount: 9072 },
    { type: 'repair', name: '门锁更换', name_nl: 'Slot vervangen', amount: 10583 },
    { type: 'door', name: '木纹卷帘门安装', name_nl: 'Houtnerf roldeur installatie', amount: 31996 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 6244 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 10447 },
    { type: 'repair', name: '底部橡胶条更换', name_nl: 'Onderste rubber vervangen', amount: 5952 },
    { type: 'repair', name: '换电机', name_nl: 'Motor vervangen', amount: 11704 },
    { type: 'door', name: '窗户卷帘安装', name_nl: 'Raamrolluik installatie', amount: 25726 },
    { type: 'repair', name: '换弹簧/链条', name_nl: 'Veer/ketting vervangen', amount: 5469 },
    { type: 'repair', name: '换导槽', name_nl: 'Geleider vervangen', amount: 3306 },
    { type: 'repair', name: '普通维修', name_nl: 'Algemene reparatie', amount: 3391 },
    { type: 'repair', name: '门板修复', name_nl: 'Paneel reparatie', amount: 7445 },
    { type: 'repair', name: '换遥控器', name_nl: 'Afstandsbediening vervangen', amount: 738 },
    { type: 'repair', name: '电机遥控器整套', name_nl: 'Motor + afstandsbediening set', amount: 12084 },
    { type: 'door', name: '铝卷帘门安装', name_nl: 'Aluminium roldeur installatie', amount: 25764 },
    { type: 'repair', name: '停电阻尼器维修', name_nl: 'Stopdamper reparatie', amount: 5361 },
    { type: 'repair', name: '清洁保养', name_nl: 'Schoonmaak en onderhoud', amount: 10522 },
  ],
};function seedDemoData() {
  if (DB.invoices.length > 0 || DB.customers.length > 0) return;
  const prefix = DB.settings.invPrefix || 'INV-';
  const yearCounters = {};
  const allCustomers = [].concat(
    DEMO_CUSTOMERS_BY_YEAR[2024] || [],
    DEMO_CUSTOMERS_BY_YEAR[2025] || [],
    DEMO_CUSTOMERS_BY_YEAR[2026] || []
  );
  let globalIdx = 0;
  const sortedKeys = Object.keys(ALL_MONTHS_ITEMS).sort();   // 2024-08 ... 2026-07
  sortedKeys.forEach(ym => {
    const items = ALL_MONTHS_ITEMS[ym];
    const year = parseInt(ym.split('-')[0], 10);
    const pool = DEMO_CUSTOMERS_BY_YEAR[year] || allCustomers;
    items.forEach((it, i) => {
      const day = String((i % 28) + 1).padStart(2, '0');
      const date = ym + '-' + day;
      const yy = String(year);
      yearCounters[yy] = (yearCounters[yy] || 0) + 1;
      const c = pool[globalIdx % pool.length];
      globalIdx++;
      const totalUSD = it.amount;
      const isDoor = it.type === 'door';
      let received, payTerm;
      if (isDoor) {
        payTerm = '50/50';
        const dd = Math.round(totalUSD * 0.5);
        const k = globalIdx % 4;
        const depDate = addDaysStr2(date, 3);           // 定金：开票后 3 天
        if (k === 0) received = { deposit: dd, balance: Math.round(totalUSD * 0.5), depositDate: depDate, balanceDate: addDaysStr2(date, 35) };
        else if (k === 1) received = { deposit: dd, balance: 0, depositDate: depDate, balanceDate: '' };
        else if (k === 2) received = { deposit: Math.round(dd * 0.6), balance: 0, depositDate: addDaysStr2(date, 5), balanceDate: '' };
        else received = { deposit: dd, balance: Math.round(totalUSD * 0.5 * 0.4), depositDate: depDate, balanceDate: addDaysStr2(date, 40) };
      } else {
        payTerm = '100';
        received = { deposit: totalUSD, balance: 0, depositDate: date, balanceDate: '' };
      }
      DB.invoices.push({
        id: uid() + globalIdx,
        number: prefix + yy + '-' + String(yearCounters[yy]).padStart(4, '0'),
        date, due: addDaysStr2(date, 7),
        payment: payTerm,
        currency: 'SRD',
        customer: { name: c.name, phone: c.phone, address: c.address },
        doors: [],
        others: [{ name_zh: it.name, name_nl: it.name_nl, price: totalUSD }],
        discount: 0,
        notes: '',
        received,
        totals: { doorsUSD: 0, othersUSD: totalUSD, discountUSD: 0, totalUSD, totalCur: totalUSD },
        status: 'saved',
        createdAt: date + 'T10:00:00.000Z'
      });
    });
  });
  // 客户池合并存为所有客户
  DB.customers = allCustomers.map(c => ({ id: uid() + c.phone, name: c.name, phone: c.phone, address: c.address, createdAt: new Date().toISOString() }));
  const curYear = String(new Date().getFullYear());
  const maxNo = DB.invoices
    .filter(inv => (inv.number || '').includes(curYear))
    .map(inv => parseInt((inv.number || '').split('-').pop(), 10) || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  if (maxNo >= DB.settings.nextNo) DB.settings.nextNo = maxNo + 1;
  saveDB();
}
function addDaysStr2(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* ---------- 购买条款摘要（中文版） ---------- */
const TERMS_ZH = [
  '尺寸测量以双方书面（WhatsApp/邮件/订单确认）确认的图纸为准；变更需另议并承担材料成本。',
  '安装（钻孔/焊接）可能对墙面/地面造成轻微痕迹或灰尘，原装修的修复不属责任范围。',
  '安装工期：____ 个工作日（自预付款完成日起算）。',
  '验收：安装完成后须签署"安装验收单"；7 日内未书面异议视为通过。',
  '尾款须在验收后 30 个日历日内付清；逾期 180 天经 8 次书面及电话催收仍无果，我方有权解除合同并收回产品。',
  '产品自验收日起 12 个月质量保修（不含异常使用或人为损坏），故障 24 小时内响应。',
  '所有付款须支付至下方公司账户；我方不接受任何个人账户或任何形式的现金付款。'
];
const TERMS_NL = [
  'Maten gebaseerd op de door beide partijen schriftelijk (WhatsApp/e-mail/order) bevestigde tekening; wijzigingen zijn voor eigen kosten.',
  'Installatiewerkzaamheden (boren/lassen) kunnen lichte sporen of stof veroorzaken; herstel van de oorspronkelijke afwerking valt buiten onze verantwoordelijkheid.',
  'Installatieduur: ____ werkdagen (te rekenen vanaf vooruitbetaling).',
  'Acceptatie: Na installatie wordt het "Installatie-Acceptatieformulier" ondertekend; zonder schriftelijk bezwaar binnen 7 dagen geldt dit als aanvaard.',
  'Resterende betaling binnen 30 kalenderdagen na acceptatie; bij 180 dagen achterstand na 8 aanmaningen behouden wij ons het recht de overeenkomst te ontbinden.',
  '12 maanden kwaliteitsgarantie vanaf acceptatiedatum (uitgezonderd abnormaal gebruik of menselijk handelen); storingen binnen 24 uur reactie.',
  'Alle betalingen uitsluitend op onderstaande bedrijfsrekening; geen contante betaling of privérekeningen.'
];

/* ---------- 增值税 BTW（苏里南：商品销售标准税率 10%，2023-01-01 起生效；历史按年月取） ---------- */
const BTW_RATE = 0.10;
// 历史税率表：'YYYY-MM' → 税率（苏里南 2023-01 起商品销售一直 10%，2024-08~2026-08 均为 10%）
const VAT_RATES = {
  '2024-08': 0.10, '2024-09': 0.10, '2024-10': 0.10, '2024-11': 0.10, '2024-12': 0.10,
  '2025-01': 0.10, '2025-02': 0.10, '2025-03': 0.10, '2025-04': 0.10, '2025-05': 0.10,
  '2025-06': 0.10, '2025-07': 0.10, '2025-08': 0.10, '2025-09': 0.10, '2025-10': 0.10,
  '2025-11': 0.10, '2025-12': 0.10,
  '2026-01': 0.10, '2026-02': 0.10, '2026-03': 0.10, '2026-04': 0.10, '2026-05': 0.10,
  '2026-06': 0.10, '2026-07': 0.10, '2026-08': 0.10
};
function vatForDate(dateStr) {
  const ym = (dateStr || '').slice(0, 7);
  if (VAT_RATES[ym] !== undefined) return VAT_RATES[ym];
  const year = (dateStr || '').slice(0, 4);
  const keys = Object.keys(VAT_RATES).filter(k => k.startsWith(year)).sort();
  if (keys.length) return VAT_RATES[keys[keys.length - 1]];
  return BTW_RATE;
}

/* ---------- USD→SRD 月度汇率（2024-08 ~ 2026-08，来源：市场中间价年度/月度锚点，开票按当月取用） ---------- */
const FX_RATES = {
  '2024-08': 34.50, '2024-09': 34.90, '2024-10': 35.30, '2024-11': 35.80, '2024-12': 36.20,
  '2025-01': 36.60, '2025-02': 36.90, '2025-03': 37.10, '2025-04': 37.30, '2025-05': 37.60,
  '2025-06': 37.80, '2025-07': 37.90, '2025-08': 38.00, '2025-09': 38.40, '2025-10': 39.00,
  '2025-11': 39.40, '2025-12': 39.20,
  '2026-01': 38.80, '2026-02': 38.30, '2026-03': 38.00, '2026-04': 37.80, '2026-05': 37.60,
  '2026-06': 37.50, '2026-07': 37.60, '2026-08': 37.90
};
function fxForDate(dateStr) {
  const ym = (dateStr || '').slice(0, 7);
  if (FX_RATES[ym]) return FX_RATES[ym];
  // 回退：按年份取最近可用值
  const year = (dateStr || '').slice(0, 4);
  const keys = Object.keys(FX_RATES).filter(k => k.startsWith(year)).sort();
  if (keys.length) return FX_RATES[keys[keys.length - 1]];
  return FX_RATES['2026-08'] || 38;
}

/* ---------- 当前编辑状态 ---------- */
let editing = {
  currency: 'SRD',
  payment: '50/50',
  doors: [],
  others: [],
  customer: { name: '', phone: '', address: '' },
  date: '',
  due: '',
  notes: '',
  discount: 0,
  receivedDeposit: 0, // 定金实收
  receivedBalance: 0  // 尾款实收
};

/* ---------- 工具 ---------- */
const $ = (id) => document.getElementById(id);
function fmt(n, cur) {
  cur = cur || editing.currency;
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : 'SRD';
  const digits = cur === 'SRD' ? 0 : 2;
  const v = cur === 'SRD' ? Math.round(n) : n;
  return sym + v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtRaw(n, cur) {
  cur = cur || editing.currency;
  const digits = cur === 'SRD' ? 0 : 2;
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function roundTo05(n) {
  const r = Math.round(n);
  const last = r % 10;
  let target;
  if (last <= 2) target = r - last;
  else if (last <= 7) target = r - last + 5;
  else target = r - last + 10;
  return target;
}
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addDaysStr(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ---------- 汇率换算 ---------- */
function toUSD(amount, cur) {
  const s = DB.settings;
  if (cur === 'USD') return amount;
  if (cur === 'EUR') return amount * s.fx.eur;
  if (cur === 'SRD') return amount / s.fx.srd;
  return amount;
}
function fromUSD(amount, cur) {
  const s = DB.settings;
  if (cur === 'USD') return amount;
  if (cur === 'EUR') return amount / s.fx.eur;
  if (cur === 'SRD') return amount * s.fx.srd;
  return amount;
}

/* ---------- i18n ---------- */
let currentLang = 'nl';  // 默认荷兰文（中文在设置页切换）
function t(key) {
  const d = I18N[currentLang] || I18N.zh;
  return d[key] !== undefined ? d[key] : (I18N.zh[key] !== undefined ? I18N.zh[key] : key);
}
function applyLang(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-ph'));
  });
  // 月份下拉选项随语言更新
  const MONTH_ZH = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const MONTH_NL = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
  const monthArr = lang === 'nl' ? MONTH_NL : MONTH_ZH;
  document.querySelectorAll('[data-month-select]').forEach(sel => {
    Array.from(sel.options).forEach(opt => {
      if (opt.value !== 'all') {
        const idx = parseInt(opt.value, 10);
        if (idx >= 1 && idx <= 12) opt.textContent = monthArr[idx - 1];
      }
    });
  });
  // 重新渲染门/其他费用（含动态文案）
  renderDoors();
  renderOthers();
  renderSummary();
}
function setLang(lang) {
  currentLang = lang;
  saveSettings({ lang });
  applyLang(lang);
  document.querySelectorAll('.lang-btn[data-lang]').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
}

/* ---------- 视图切换 ---------- */
function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('view-' + view).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'records') { renderRecords(); renderStats(); }
  if (view === 'customers') renderCustomers();
  if (view === 'settings') loadSettingsForm();
}

/* ---------- 月度收入统计（跟随顶部年月筛选） ---------- */
function renderStats() {
  const year = $('record-year').value;
  const month = $('record-month').value;
  const list = DB.invoices.filter(inv => {
    const d = inv.date || '';
    if (year !== 'all' && !d.startsWith(year)) return false;
    if (month !== 'all' && parseInt(d.split('-')[1], 10) !== parseInt(month, 10)) return false;
    return true;
  });
  let total = 0, deposit = 0, balance = 0;
  const vatRate = (DB.settings.vatRate != null ? DB.settings.vatRate : 10) / 100;
  list.forEach(inv => {
    const t = inv.totals.totalUSD || 0;                 // 不含税
    const incl = t + Math.round(t * vatRate);           // 含税 = 不含税 + 税额
    total += incl;
    const p = inv.payment;
    if (p === '100') deposit += incl;          // 全款预付 → 全算定金
    else if (p === '0/100') balance += incl;   // 安装后付清 → 全算尾款
    else { deposit += incl * 0.5; balance += incl * 0.5; } // 50/50
  });
  $('stat-total').textContent = fmtRaw(Math.round(total), 'SRD') + ' SRD';
  $('stat-deposit').textContent = fmtRaw(Math.round(deposit), 'SRD') + ' SRD';
  $('stat-balance').textContent = fmtRaw(Math.round(balance), 'SRD') + ' SRD';
  $('stat-count').textContent = list.length + (currentLang === 'nl' ? ' stuks' : ' 张');
  // 统计期间提示（随语言）
  const el = $('stat-period');
  if (el) {
    const NL = currentLang === 'nl';
    const MONTHS_NL = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
    if (year === 'all' && month === 'all') el.textContent = NL ? 'Alle periodes' : '全部期间';
    else if (month === 'all') el.textContent = NL ? year + ' (heel jaar)' : year + ' 全年';
    else el.textContent = NL ? (MONTHS_NL[parseInt(month, 10) - 1] + ' ' + year) : (year + ' 年 ' + month + ' 月');
  }
}

/* ---------- 门信息 ---------- */
const DOOR_TYPES = [
  { id: 'iron', key: 'type_iron' },
  { id: 'iron_open', key: 'type_iron_open' },
  { id: 'alu', key: 'type_alu' },
  { id: 'alu_open', key: 'type_alu_open' },
  { id: 'wood', key: 'type_wood' }
];
const DOOR_COLORS = [
  { id: 'white', key: 'col_white' },
  { id: 'black', key: 'col_black' },
  { id: 'gray', key: 'col_gray' },
  { id: 'wood', key: 'col_wood' },
  { id: 'galvaan', key: 'col_galvaan' }
];

function addDoor() {
  editing.doors.push({
    id: uid(),
    type: 'alu',
    color: 'white',
    qty: 1,
    price: '' // 手动输入金额
  });
  renderDoors();
}
function removeDoor(id) {
  editing.doors = editing.doors.filter(d => d.id !== id);
  renderDoors();
}
function renderDoors() {
  const wrap = $('door-list');
  if (!wrap) return;
  if (editing.doors.length === 0) {
    wrap.innerHTML = '<div class="empty" style="padding:16px 0">' + t('no_data') + ' ' + t('sec_doors') + '</div>';
    return;
  }
  wrap.innerHTML = editing.doors.map((d, i) => {
    const qty = parseInt(d.qty) || 1;
    const price = parseFloat(d.price) || 0;
    const amount = price * qty;
    return `
    <div class="door-card">
      <div class="door-head">
        <span class="door-title">${t('door_no')}${i + 1}</span>
        <button class="door-remove" onclick="removeDoor('${d.id}')" title="${t('act_delete')}">×</button>
      </div>
      <div class="grid" style="grid-template-columns:1.2fr 1fr .6fr 1fr;gap:10px">
        <div class="field">
          <label>${t('lbl_type')}</label>
          <select onchange="updateDoor('${d.id}','type',this.value)">
            ${DOOR_TYPES.map(tp => `<option value="${tp.id}" ${d.type === tp.id ? 'selected' : ''}>${t(tp.key)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>${t('lbl_color')}</label>
          <select onchange="updateDoor('${d.id}','color',this.value)">
            ${DOOR_COLORS.map(c => `<option value="${c.id}" ${d.color === c.id ? 'selected' : ''}>${t(c.key)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>${t('lbl_qty')}</label>
          <input type="number" min="1" value="${d.qty}" oninput="updateDoor('${d.id}','qty',this.value)">
        </div>
        <div class="field">
          <label>${t('lbl_price_input')} (${editing.currency})</label>
          <input type="number" step="0.01" min="0" value="${d.price}" placeholder="0" oninput="updateDoor('${d.id}','price',this.value)">
        </div>
      </div>
      <div class="door-amount">
        <span>${t('lbl_amount')}:</span>
        <span class="mono" style="color:var(--primary);font-weight:600">${fmt(amount)}</span>
      </div>
    </div>`;
  }).join('');
  renderSummary();
}
function updateDoor(id, field, value) {
  const d = editing.doors.find(x => x.id === id);
  if (!d) return;
  d[field] = value;
  if (field === 'price' || field === 'qty' || field === 'type' || field === 'color') {
    renderDoors();
  }
}

/* ---------- 其他费用 ---------- */
function addOther() {
  editing.others.push({ id: uid(), name_zh: '', name_nl: '', price: '' });
  renderOthers();
}
function removeOther(id) {
  editing.others = editing.others.filter(x => x.id !== id);
  renderOthers();
}
function updateOther(id, field, value) {
  const o = editing.others.find(x => x.id === id);
  if (!o) return;
  o[field] = value;
  if (field === 'price') renderOthers();
}
function renderOthers() {
  const body = $('other-body');
  if (!body) return;
  if (editing.others.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="empty">—</td></tr>';
    return;
  }
  body.innerHTML = editing.others.map(o => {
    const amount = parseFloat(o.price) || 0;
    return `
    <tr>
      <td><input type="text" value="${escAttr(o.name_zh)}" placeholder="品名" onchange="updateOther('${o.id}','name_zh',this.value)"></td>
      <td><input type="text" value="${escAttr(o.name_nl)}" placeholder="NL naam" onchange="updateOther('${o.id}','name_nl',this.value)"></td>
      <td>
        <input type="number" step="0.01" min="0" value="${o.price}" placeholder="0" oninput="updateOther('${o.id}','price',this.value)">
      </td>
      <td class="mono">${fmt(amount)}</td>
      <td><button class="door-remove" onclick="removeOther('${o.id}')">×</button></td>
    </tr>`;
  }).join('');
  renderSummary();
}

/* ---------- 汇总计算 ---------- */
function computeTotals() {
  // 门体（手动输入金额 × 数量，SRD）
  let doors = 0;
  editing.doors.forEach(d => {
    doors += (parseFloat(d.price) || 0) * (parseInt(d.qty) || 1);
  });
  // 其他费用（SRD）
  let others = 0;
  editing.others.forEach(o => {
    others += parseFloat(o.price) || 0;
  });
  // 优惠（SRD）
  const discount = parseFloat(editing.discount) || 0;
  // 总价（SRD）
  let total = doors + others - discount;
  if (total < 0) total = 0;
  return {
    doorsUSD: doors, othersUSD: others, discountUSD: discount, totalUSD: total,
    doorsCur: doors, othersCur: others,
    discountCur: discount, totalCur: total
  };
}
function renderSummary() {
  const c = computeTotals();
  $('sum-doors').textContent = fmt(c.doorsCur);
  $('sum-other').textContent = fmt(c.othersCur);
  $('sum-discount').textContent = '-' + fmt(c.discountCur);
  $('sum-total').textContent = fmt(c.totalCur);
  // 税额：不含税金额 × 税率（税率取设置，默认 10%），总金额 = 不含税 + 税额
  const el = $('sum-btw');
  if (el) {
    const rate = (DB.settings.vatRate != null ? DB.settings.vatRate : 10) / 100;
    const btw = Math.round(c.totalCur * rate);
    el.textContent = fmt(btw);
  }
  renderReceivedHints();
}

/* ---------- 收款记录 ---------- */
// 根据付款条款计算应缴定金/尾款（SRD）
function dueAmounts() {
  const c = computeTotals();
  const total = c.totalCur;
  const p = $('inv-payment') ? $('inv-payment').value : (editing.payment || '50/50');
  if (p === '100') return { deposit: total, balance: 0 };
  if (p === '0/100') return { deposit: 0, balance: total };
  return { deposit: total * 0.5, balance: total * 0.5 };
}
function renderReceivedHints() {
  if (!$('due-deposit')) return;
  const d = dueAmounts();
  const label = currentLang === 'nl' ? 'Verschuldigd' : '应缴';
  $('due-deposit').textContent = label + ' SRD ' + fmtRaw(Math.round(d.deposit), 'SRD');
  $('due-balance').textContent = label + ' SRD ' + fmtRaw(Math.round(d.balance), 'SRD');
}

/* ---------- 保存 ---------- */
function collectInvoice() {
  const num = $('inv-number').value.trim();
  const cur = $('invoice-currency').value;
  const c = computeTotals();
  const inv = {
    id: uid(),
    number: num,
    date: $('inv-date').value,
    due: $('inv-due').value,
    payment: $('inv-payment').value,
    currency: cur,
    customer: {
      name: $('cust-name').value.trim(),
      phone: $('cust-phone').value.trim(),
      address: $('cust-address').value.trim()
    },
    doors: editing.doors.map(d => ({
      type: d.type, color: d.color, qty: d.qty, price: d.price
    })),
    others: editing.others.map(o => ({
      name_zh: o.name_zh, name_nl: o.name_nl, price: o.price
    })),
    discount: editing.discount,
    notes: $('inv-notes').value.trim(),
    received: {
      deposit: parseFloat($('inv-received-deposit').value) || 0,
      balance: parseFloat($('inv-received-balance').value) || 0,
      depositDate: $('inv-deposit-date').value || '',
      balanceDate: $('inv-balance-date').value || ''
    },
    totals: {
      doorsUSD: c.doorsUSD, othersUSD: c.othersUSD,
      discountUSD: c.discountUSD, totalUSD: c.totalUSD,
      totalCur: c.totalCur
    },
    status: 'saved',
    createdAt: new Date().toISOString()
  };
  return inv;
}
function saveInvoice() {
  if (!$('cust-name').value.trim()) { toast(t('toast_fill_customer')); return; }
  // 自动编号
  if (!$('inv-number').value.trim()) {
    const prefix = DB.settings.invPrefix || 'INV-';
    const year = new Date().getFullYear();
    const no = prefix + year + '-' + String(DB.settings.nextNo).padStart(4, '0');
    $('inv-number').value = no;
    DB.settings.nextNo++;
  }
  const inv = collectInvoice();
  DB.invoices.unshift(inv);
  // 客户自动入库
  if (inv.customer.name) {
    const exist = DB.customers.find(c => c.name.toLowerCase() === inv.customer.name.toLowerCase());
    if (exist) {
      if (inv.customer.phone && !exist.phone) exist.phone = inv.customer.phone;
      if (inv.customer.address && !exist.address) exist.address = inv.customer.address;
    } else {
      DB.customers.push({ id: uid(), name: inv.customer.name, phone: inv.customer.phone, address: inv.customer.address, createdAt: new Date().toISOString() });
    }
  }
  saveDB();
  toast(t('toast_saved'));
}

/* ---------- 打印 ---------- */
function buildPrintHTML(inv, isQuote) {
  const s = DB.settings;
  const co = s.company;
  const cur = 'SRD';
  const L = inv.lang ? I18N[inv.lang] : I18N.zh;
  const base = inv.totals || {};

  // 门明细行（手动金额）
  let doorRows = '';
  if (inv.doors && inv.doors.length) {
    inv.doors.forEach((d, i) => {
      const typeTxt = t2('type_' + d.type, inv.lang);
      const colorTxt = t2('col_' + d.color, inv.lang);
      const price = parseFloat(d.price) || 0;
      const qty = parseInt(d.qty) || 1;
      const line = price * qty;
      doorRows += `<tr class="item-row">
        <td><div class="i-name">${qty > 1 ? qty + '× ' : ''}${esc(typeTxt)} · ${esc(colorTxt)}</div>
        <div class="i-desc">${esc(typeTxt)} ${esc(colorTxt)}</div></td>
        <td style="text-align:center">${qty}</td>
        <td style="text-align:right">${fmtCur(price, 'SRD')}</td>
        <td style="text-align:right">${fmtCur(line, 'SRD')}</td>
      </tr>`;
    });
  }

  // 其他费用行
  let otherRows = '';
  if (inv.others && inv.others.length) {
    inv.others.forEach(o => {
      const name = inv.lang === 'nl' ? (o.name_nl || o.name_zh) : (o.name_zh || o.name_nl);
      if (!name) return;
      const shown = parseFloat(o.price) || 0;
      otherRows += `<tr class="item-row">
        <td><div class="i-name">${esc(name)}</div></td>
        <td style="text-align:center">1</td>
        <td style="text-align:right">${fmtCur(shown, 'SRD')}</td>
        <td style="text-align:right">${fmtCur(shown, 'SRD')}</td>
      </tr>`;
    });
  }

  const payTerm = inv.payment === '100' ? L.term_pay100 : inv.payment === '0/100' ? L.term_pay0 : L.term_deposit;
  const docTitle = isQuote ? (inv.lang === 'nl' ? 'OFFERTE' : '报价单') : (inv.lang === 'nl' ? 'FACTUUR' : '发票');
  const docSub = inv.lang === 'nl' ? 'QUOTE / FACTUUR' : '报价单 / 发票';

  const doorsUSD = base.doorsUSD || 0;
  const othersUSD = base.othersUSD || 0;
  const discountUSD = base.discountUSD || 0;
  const totalUSD = base.totalUSD || 0;   // 不含税金额（明细合计）
  const subtotal = doorsUSD + othersUSD;
  // 增值税：税率取设置值（默认 10%，可在设置修改）；税额 = 不含税金额 × 税率；总金额 = 不含税 + 税额
  const vatRate = (DB.settings.vatRate != null ? DB.settings.vatRate : 10) / 100;
  const vatPct = Math.round(vatRate * 100);
  const btwAmount = Math.round(totalUSD * vatRate);
  const totalIncl = totalUSD + btwAmount;   // 含税总金额 = 发票总金额
  const fxRate = fxForDate(inv.date);
  const fxLabel = inv.lang === 'nl'
    ? 'Koers: 1 USD = ' + fxRate.toFixed(2).replace('.', ',') + ' SRD'
    : '汇率: 1 USD = ' + fxRate.toFixed(2) + ' SRD';
  const vatLabel = inv.lang === 'nl'
    ? 'BTW ' + vatPct + '%'
    : '增值税 BTW ' + vatPct + '%';
  const vatNote = inv.lang === 'nl'
    ? 'Totaal = excl. BTW + ' + vatPct + '% BTW'
    : '总金额 = 不含税 + ' + vatPct + '% 增值税';

  return `
  <div class="sheet" lang="${inv.lang || 'zh'}">
    <div class="sheet-header">
      <div>
        <div class="co-name">${esc(co.name || '')}</div>
        <div class="co-tag">${esc(inv.lang === 'nl' ? (co.tag_nl || '') : (co.tag_zh || ''))}</div>
        <div class="co-contact">
          ${co.address ? esc(co.address) + '<br>' : ''}
          ${co.phone ? 'T: ' + esc(co.phone) + (co.web ? '  |  W: ' + esc(co.web) : '') : esc(co.web || '')}
          ${co.email ? '<br>E: ' + esc(co.email) : ''}
          ${co.tax ? '<br>' + (inv.lang === 'nl' ? 'BTW' : '税号') + ': ' + esc(co.tax) : ''}
          ${co.kvk ? '<br>KVK: ' + esc(co.kvk) : ''}
        </div>
      </div>
      <div class="inv-title-box">
        <div class="inv-title">${docTitle}</div>
        <div class="inv-sub">${docSub}</div>
        <div class="inv-meta">
          <b>${inv.lang === 'nl' ? 'Factuurnr' : '编号'}:</b> ${esc(inv.number)}<br>
          <b>${inv.lang === 'nl' ? 'Datum' : '日期'}:</b> ${esc(inv.date)}<br>
          <b>${inv.lang === 'nl' ? 'Geldig tot' : '有效期至'}:</b> ${esc(inv.due || '—')}<br>
          <b>${inv.lang === 'nl' ? 'BTW-tarief' : '税率'}: ${vatPct}%</b><br>          <b>${fxLabel}</b>
        </div>
      </div>
    </div>
    <div class="sheet-body">
      <div class="billing">
        <div class="bill-block">
          <h4>${L.lbl_company}</h4>
          <div class="v">${esc(co.name || '')}</div>
          <div class="s">${co.address ? esc(co.address) + '<br>' : ''}${co.phone ? 'T: ' + esc(co.phone) + '<br>' : ''}${co.email ? esc(co.email) : ''}</div>
        </div>
        <div class="bill-block">
          <h4>${L.lbl_bill_to}</h4>
          <div class="v">${esc(inv.customer.name || '')}</div>
          <div class="s">${inv.customer.phone ? 'T: ' + esc(inv.customer.phone) + '<br>' : ''}${inv.customer.address ? esc(inv.customer.address) : ''}</div>
        </div>
      </div>
      <table class="items">
        <thead>
          <tr>
            <th style="width:52%">${L.th_description}</th>
            <th style="width:10%;text-align:center">${L.th_qty}</th>
            <th style="width:16%;text-align:right">${L.th_unit_price}</th>
            <th style="width:18%;text-align:right">${L.th_amount}</th>
          </tr>
        </thead>
        <tbody>
          ${doorRows}${otherRows}
        </tbody>
      </table>
      <div class="totals">
        <div class="totals-box">
          <div class="row"><span class="lbl">${L.sub_total} ${inv.lang === 'nl' ? '(excl. BTW)' : '（不含税）'}</span><span>${fmtCur(totalUSD, 'SRD')}</span></div>
          ${discountUSD > 0 ? `<div class="row"><span class="lbl">${L.discount}</span><span>-${fmtCur(discountUSD, 'SRD')}</span></div>` : ''}
          <div class="row btw-row"><span class="lbl">${vatLabel}</span><span>${fmtCur(btwAmount, 'SRD')}</span></div>
          <div class="row grand"><span class="lbl">${L.grand_total} ${inv.lang === 'nl' ? '(incl. BTW)' : '（含税）'}</span><span>${fmtCur(totalIncl, 'SRD')}</span></div>
          <div class="row btw-note">${vatNote}</div>
        </div>
        <div class="stamp-wrap">
          <div class="stamp">
            <svg viewBox="0 0 300 80" preserveAspectRatio="xMidYMid meet">
              <rect x="2" y="2" width="296" height="76" rx="6" fill="none" stroke="#c8102e" stroke-width="3"/>
              <rect x="7" y="7" width="286" height="66" rx="4" fill="none" stroke="#c8102e" stroke-width="1"/>
              <text x="150" y="52" text-anchor="middle" fill="#c8102e" font-size="28" font-weight="bold" font-family="'Arial Black', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" textLength="268" lengthAdjust="spacingAndGlyphs">PANDA ALUMINIUM PRODUCTS</text>
            </svg>
          </div>
        </div>
      </div>
      ${inv.notes ? `<div class="notes-block"><b>${L.notes_label}: </b>${esc(inv.notes)}</div>` : ''}
      <div class="terms">
        <b>${L.terms_title}:</b> ${payTerm}<br>
        ${L.term_quote_valid}
      </div>
      <div class="conds">
        <b>${inv.lang === 'nl' ? 'Voorwaarden (samenvatting)' : '购买条款摘要'}</b>
        <ol>
          ${(inv.lang === 'nl' ? TERMS_NL : TERMS_ZH).map(it => '<li>' + esc(it) + '</li>').join('')}
        </ol>
        <div class="conds-bank">
          <b>${inv.lang === 'nl' ? 'Rekeninghouder' : '账户名'}:</b> ${esc(co.bank_holder || 'WANGCHUNFU')}<br>
          <b>${inv.lang === 'nl' ? 'Bank' : '银行'}:</b> ${esc(co.bank || 'Hakrinbank · SRD 200070251 / USD 206861082')}<br>
          <i>${inv.lang === 'nl' ? 'Geen contante betaling of betaling aan privérekeningen.' : '不接受现金付款或个人账户付款。'}</i>
        </div>
      </div>
    </div>
    <div class="sheet-foot">
      <div>
        <div class="thank">${L.thank_you}</div>
        <div>${L.foot_note}</div>
      </div>
    </div>
  </div>`;
}

/* ---------- 打印辅助 ---------- */
function t2(key, lang) {
  const d = I18N[lang] || I18N.zh;
  return d[key] !== undefined ? d[key] : key;
}
function fmtNl(v) { return String(v).replace('.', ','); }
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(s) {
  return esc(s).replace(/'/g, '&#39;');
}
function fmtUSD(v, cur) {
  if (cur === 'USD') return '$' + fmtRaw(v, 'USD');
  return cur + ' ' + fmtRaw(v, cur);
}
// 打印用：按指定货币格式化（SRD 整数，USD/EUR 两位小数）
function fmtCur(v, cur) {
  cur = cur || 'USD';
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : 'SRD';
  const digits = cur === 'SRD' ? 0 : 2;
  return sym + v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function printInvoice(inv) {
  $('print-area').innerHTML = buildPrintHTML(inv, false);
  setTimeout(() => { window.print(); }, 60);
}

/* ---------- 发票记录 ---------- */
function renderRecords() {
  const body = $('record-body');
  const kw = ($('record-search').value || '').trim().toLowerCase();
  const year = $('record-year').value;
  const month = $('record-month').value;
  let list = DB.invoices;
  // 年月筛选
  if (year !== 'all') {
    list = list.filter(inv => (inv.date || '').startsWith(year));
  }
  if (month !== 'all') {
    list = list.filter(inv => {
      const m = parseInt((inv.date || '').split('-')[1], 10);
      return m === parseInt(month, 10);
    });
  }
  if (kw) {
    list = list.filter(inv =>
      inv.number.toLowerCase().includes(kw) ||
      (inv.customer.name || '').toLowerCase().includes(kw) ||
      String(inv.totals.totalCur || '').includes(kw) ||
      String(inv.totals.totalUSD || '').includes(kw)
    );
  }
  $('record-empty').style.display = list.length ? 'none' : 'block';
  const vatRateList = (DB.settings.vatRate != null ? DB.settings.vatRate : 10) / 100;
  body.innerHTML = list.map(inv => {
    const baseAmt = inv.totals.totalCur !== undefined ? inv.totals.totalCur : (inv.totals.totalUSD || 0);
    const grand = baseAmt + Math.round(baseAmt * vatRateList);   // 含税总金额 = 不含税 + 税额
    return `
    <tr>
      <td class="mono">${esc(inv.number)}</td>
      <td><strong>${esc(inv.customer.name || '—')}</strong></td>
      <td>${esc(inv.date || '—')}</td>
      <td class="mono"><strong>${fmtRaw(grand, 'SRD')} SRD</strong></td>
      <td><span style="color:var(--green)">${t('status_saved')}</span></td>
      <td>
        <div class="btn-row" style="gap:6px">
          <button class="btn btn-small btn-ghost" onclick="viewRecord('${inv.id}')">${t('act_view')}</button>
          <button class="btn btn-small btn-ghost" onclick="printRecord('${inv.id}')">${t('act_print')}</button>
          <button class="btn btn-small btn-ghost" onclick="duplicateRecord('${inv.id}')">${t('act_duplicate')}</button>
          <button class="btn btn-small btn-danger" onclick="deleteRecord('${inv.id}')">${t('act_delete')}</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}
/* ---------- 发票预览弹窗 ---------- */
let viewingInvoice = null;   // 当前查看的发票
let viewingLang = 'zh';      // 当前预览语言

function viewRecord(id) {
  const inv = DB.invoices.find(x => x.id === id);
  if (!inv) return;
  viewingInvoice = inv;
  viewingLang = currentLang;   // 发票语言跟随界面语言（左下角切换）
  renderViewInvoice();
  $('modal-view').classList.add('show');
}
function renderViewInvoice() {
  const body = $('view-body');
  if (!body) return;
  const invForPrint = Object.assign({}, viewingInvoice, { lang: viewingLang });
  body.innerHTML = buildPrintHTML(invForPrint, false);
  const sheet = body.querySelector('.sheet');
  if (sheet) sheet.style.cssText += ';margin:0 auto;box-shadow:0 4px 20px rgba(0,0,0,.2);border-radius:6px;';
}
function printViewInvoice() {
  if (!viewingInvoice) return;
  printInvoice(Object.assign({}, viewingInvoice, { lang: viewingLang }));
}

/* ---------- 发票分享（WhatsApp / Email） ---------- */
function buildShareText(inv) {
  const L = I18N[viewingLang] || I18N.nl;
  const co = DB.settings.company;
  const cur = 'SRD';
  const lines = [];
  // 标题
  lines.push(L.doc_title ? (L.doc_title + ' ' + inv.number) : ('Factuur ' + inv.number));
  lines.push('PANDA ALUMINIUM PRODUCTS');
  if (co.address) lines.push(co.address);
  if (co.phone) lines.push('T: ' + co.phone);
  if (co.email) lines.push('E: ' + co.email);
  lines.push('');
  // 客户
  lines.push(L.lbl_bill_to + ': ' + inv.customer.name);
  if (inv.customer.phone) lines.push('T: ' + inv.customer.phone);
  if (inv.customer.address) lines.push(inv.customer.address);
  lines.push('');
  // 明细
  const thDesc = viewingLang === 'nl' ? 'Omschrijving' : '项目';
  const thAmt = viewingLang === 'nl' ? 'Bedrag' : '金额';
  lines.push(thDesc + '\t' + thAmt);
  const allItems = [].concat(inv.doors || [], inv.others || []);
  (inv.others || []).forEach(o => {
    const n = viewingLang === 'nl' ? (o.name_nl || o.name_zh) : (o.name_zh || o.name_nl);
    lines.push(n + '\t' + fmtRaw(Math.round(o.price), cur) + ' ' + cur);
  });
  lines.push('');
  // 合计（不含税 + 税额 = 含税总金额）
  const total = inv.totals.totalUSD || 0;
  const rate = (DB.settings.vatRate != null ? DB.settings.vatRate : 10) / 100;
  const btw = Math.round(total * rate);
  const incl = total + btw;
  lines.push((viewingLang === 'nl' ? 'Subtotaal (excl. BTW)' : '小计（不含税）') + ': ' + fmtRaw(Math.round(total), cur) + ' ' + cur);
  lines.push((viewingLang === 'nl' ? 'BTW ' : '增值税 ') + Math.round(rate * 100) + '%: ' + fmtRaw(btw, cur) + ' ' + cur);
  lines.push((viewingLang === 'nl' ? 'Totaal (incl. BTW)' : '合计（含税）') + ': ' + fmtRaw(Math.round(incl), cur) + ' ' + cur);
  // 付款条款
  const payTxt = inv.payment === '100' ? (viewingLang === 'nl' ? 'Vooruitbetaling' : '全款预付')
    : inv.payment === '0/100' ? (viewingLang === 'nl' ? 'Na installatie' : '安装后付清')
    : '50/50';
  lines.push((viewingLang === 'nl' ? 'Betaling' : '付款') + ': ' + payTxt);
  // 银行
  if (co.bank) {
    lines.push('');
    lines.push((viewingLang === 'nl' ? 'Bankgegevens' : '银行账户') + ':');
    if (co.bank_holder) lines.push((viewingLang === 'nl' ? 'Naam' : '账户名') + ': ' + co.bank_holder);
    lines.push(co.bank);
  }
  lines.push('');
  lines.push(viewingLang === 'nl' ? 'Dank u wel!' : '谢谢！');
  return lines.join('\n');
}
function shareViewWhatsApp() {
  if (!viewingInvoice) return;
  const text = buildShareText(viewingInvoice);
  const url = 'https://wa.me/?text=' + encodeURIComponent(text);
  window.open(url, '_blank');
}
function shareViewEmail() {
  if (!viewingInvoice) return;
  const text = buildShareText(viewingInvoice);
  const subject = 'Factuur ' + viewingInvoice.number;
  const url = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
  window.location.href = url;
}

function printRecord(id) {
  const inv = DB.invoices.find(x => x.id === id);
  if (inv) printInvoice(inv);
}
function duplicateRecord(id) {
  const inv = DB.invoices.find(x => x.id === id);
  if (!inv) return;
  $('cust-name').value = inv.customer.name || '';
  $('cust-phone').value = inv.customer.phone || '';
  $('cust-address').value = inv.customer.address || '';
  $('inv-date').value = todayStr();
  $('inv-due').value = addDaysStr(7);
  $('inv-payment').value = inv.payment || '50/50';
  $('inv-notes').value = inv.notes || '';
  $('inv-discount').value = inv.discount || 0;
  const rec = inv.received || {};
  $('inv-received-deposit').value = rec.deposit || 0;
  $('inv-received-balance').value = rec.balance || 0;
  $('inv-deposit-date').value = rec.depositDate || '';
  $('inv-balance-date').value = rec.balanceDate || '';
  editing.receivedDeposit = parseFloat(rec.deposit) || 0;
  editing.receivedBalance = parseFloat(rec.balance) || 0;
  editing.doors = (inv.doors || []).map(d => ({ id: uid(), type: d.type, color: d.color, qty: d.qty, price: d.price }));
  editing.others = (inv.others || []).map(o => ({ id: uid(), name_zh: o.name_zh, name_nl: o.name_nl, price: o.price }));
  editing.discount = inv.discount || 0;
  editing.currency = 'SRD';
  renderDoors(); renderOthers();
  switchView('invoice');
  window.scrollTo(0, 0);
}
function deleteRecord(id) {
  if (!confirm(t('confirm_delete'))) return;
  DB.invoices = DB.invoices.filter(x => x.id !== id);
  saveDB();
  renderRecords();
  toast(t('toast_deleted'));
}

/* ---------- 客户管理 ---------- */
function renderCustomers() {
  const body = $('customer-body');
  const kw = ($('customer-search').value || '').trim().toLowerCase();
  const year = $('cust-year').value;
  const month = $('cust-month').value;
  // 按年月筛选发票（只统计装门客户：付款条款 50/50 的订单，修门 100 不列入客户管理）
  const invs = DB.invoices.filter(inv => {
    const d = inv.date || '';
    if (year !== 'all' && !d.startsWith(year)) return false;
    if (month !== 'all' && parseInt(d.split('-')[1], 10) !== parseInt(month, 10)) return false;
    if (inv.payment === '100') return false;   // 修门（当面结清）不录入客户管理
    return true;
  });
  // 统计每个客户（筛选期内）的发票数、定金、尾款
  const stats = {};
  invs.forEach(inv => {
    const name = inv.customer.name || '';
    if (!stats[name]) stats[name] = { count: 0, dueDeposit: 0, dueBalance: 0, recDeposit: 0, recBalance: 0 };
    stats[name].count++;
    const t = inv.totals.totalUSD || 0;
    const p = inv.payment;
    let dd = 0, db = 0;
    if (p === '100') dd = t;
    else if (p === '0/100') db = t;
    else { dd = t * 0.5; db = t * 0.5; }
    stats[name].dueDeposit += dd;
    stats[name].dueBalance += db;
    const rec = inv.received || {};
    stats[name].recDeposit += parseFloat(rec.deposit) || 0;
    stats[name].recBalance += parseFloat(rec.balance) || 0;
  });
  let list = DB.customers.filter(c => stats[c.name]); // 只看筛选期内有发票的客户
  if (kw) list = list.filter(c => c.name.toLowerCase().includes(kw) || (c.phone || '').includes(kw));
  $('customer-empty').style.display = list.length ? 'none' : 'block';
  body.innerHTML = list.map(c => {
    const s = stats[c.name];
    const recDeposit = Math.round(s.recDeposit);
    const recBalance = Math.round(s.recBalance);
    const dueDeposit = Math.round(s.dueDeposit);
    const dueBalance = Math.round(s.dueBalance);
    const remain = (dueDeposit + dueBalance) - (recDeposit + recBalance);
    const depTxt = dueDeposit > 0
      ? `<span style="color:${recDeposit >= dueDeposit ? 'var(--green)' : 'var(--primary)'}">${fmtRaw(recDeposit, 'SRD')}</span>/<span class="mono" style="color:var(--text-dim)">${fmtRaw(dueDeposit, 'SRD')}</span>`
      : '—';
    const balTxt = dueBalance > 0
      ? `<span style="color:${recBalance >= dueBalance ? 'var(--green)' : ''}">${fmtRaw(recBalance, 'SRD')}</span>/<span class="mono" style="color:var(--text-dim)">${fmtRaw(dueBalance, 'SRD')}</span>`
      : '—';
    const remainTxt = remain > 0
      ? `<span style="color:var(--red);font-weight:700">${fmtRaw(remain, 'SRD')}</span>`
      : `<span style="color:var(--green)">${currentLang === 'nl' ? 'Betaald' : '已结清'}</span>`;
    return `
    <tr>
      <td><strong>${esc(c.name)}</strong></td>
      <td class="mono">${esc(c.phone || '—')}</td>
      <td>${esc(c.address || '—')}</td>
      <td>${s.count}</td>
      <td class="mono">${depTxt}</td>
      <td class="mono">${balTxt}</td>
      <td class="mono">${remainTxt}</td>
      <td>
        <div class="btn-row" style="gap:6px">
          <button class="btn btn-small btn-ghost" onclick="viewCustomerDetail('${c.id}')">${t('act_detail')}</button>
          <button class="btn btn-small btn-ghost" onclick="editCustomer('${c.id}')">${t('act_edit')}</button>
          <button class="btn btn-small btn-danger" onclick="deleteCustomer('${c.id}')">${t('act_delete')}</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* ---------- 客户详情 ---------- */
function viewCustomerDetail(id) {
  const c = DB.customers.find(x => x.id === id);
  if (!c) return;
  const NL = viewingLang === 'nl';
  // 客户详情只显示装门记录（修门散客不录入）
  const invs = DB.invoices.filter(i => i.customer.name === c.name && i.payment !== '100').sort((a, b) => (a.date < b.date ? -1 : 1));
  const totalDue = invs.reduce((s, i) => s + (i.totals.totalUSD || 0), 0);
  const totalRec = invs.reduce((s, i) => {
    const r = i.received || {};
    return s + ((r.deposit || 0) + (r.balance || 0));
  }, 0);
  const remain = Math.round(totalDue - totalRec);
  // 客户信息头
  let h = `<div class="detail-head">
    <div><strong style="font-size:16px">${esc(c.name)}</strong></div>
    <div class="detail-sub">${esc(c.phone || '')}${c.address ? ' · ' + esc(c.address) : ''}</div>
  </div>
  <div class="detail-stats">
    <div class="stat-box"><div class="stat-num">${invs.length}</div><div class="stat-label">${NL ? 'Facturen' : '发票数'}</div></div>
    <div class="stat-box"><div class="stat-num">${fmtRaw(Math.round(totalDue), 'SRD')}</div><div class="stat-label">${NL ? 'Totaal' : '总金额'}</div></div>
    <div class="stat-box"><div class="stat-num accent">${fmtRaw(Math.round(totalRec), 'SRD')}</div><div class="stat-label">${NL ? 'Ontvangen' : '已收'}</div></div>
    <div class="stat-box"><div class="stat-num" style="color:${remain > 0 ? 'var(--red)' : 'var(--green)'}">${remain > 0 ? fmtRaw(remain, 'SRD') : (NL ? 'Betaald' : '已结清')}</div><div class="stat-label">${NL ? 'Openstaand' : '剩余'}</div></div>
  </div>
  <table class="table detail-table"><thead><tr>
    <th>${NL ? 'Factuur' : '发票号'}</th>
    <th>${NL ? 'Datum' : '开票日期'}</th>
    <th>${NL ? 'Omschrijving' : '项目'}</th>
    <th>${NL ? 'Bedrag' : '金额'}</th>
    <th>${NL ? 'Aanbetaling' : '定金'}</th>
    <th>${NL ? 'Restbedrag' : '尾款'}</th>
  </tr></thead><tbody>`;
  invs.forEach(inv => {
    const r = inv.received || {};
    const items = [].concat(inv.doors || [], inv.others || []);
    const desc = items.map(o => NL ? (o.name_nl || o.name_zh) : (o.name_zh || o.name_nl)).join('、') || '—';
    const depTxt = (r.deposit || 0) > 0
      ? fmtRaw(Math.round(r.deposit), 'SRD') + (r.depositDate ? '<br><span class="date-tag">' + r.depositDate + '</span>' : '')
      : '—';
    const balTxt = (r.balance || 0) > 0
      ? fmtRaw(Math.round(r.balance), 'SRD') + (r.balanceDate ? '<br><span class="date-tag">' + r.balanceDate + '</span>' : '')
      : '—';
    h += `<tr>
      <td class="mono">${esc(inv.number)}</td>
      <td>${esc(inv.date || '')}</td>
      <td>${esc(desc)}</td>
      <td class="mono"><strong>${fmtRaw(Math.round(inv.totals.totalUSD || 0), 'SRD')}</strong></td>
      <td class="mono">${depTxt}</td>
      <td class="mono">${balTxt}</td>
    </tr>`;
  });
  h += `</tbody></table>`;
  $('customer-detail-body').innerHTML = h;
  $('modal-customer-detail').classList.add('show');
}
let editingCustomerId = null;
function addCustomer() {
  editingCustomerId = null;
  $('edit-cust-name').value = '';
  $('edit-cust-phone').value = '';
  $('edit-cust-address').value = '';
  $('modal-customer-edit').classList.add('show');
}
function editCustomer(id) {
  const c = DB.customers.find(x => x.id === id);
  if (!c) return;
  editingCustomerId = id;
  $('edit-cust-name').value = c.name;
  $('edit-cust-phone').value = c.phone || '';
  $('edit-cust-address').value = c.address || '';
  $('modal-customer-edit').classList.add('show');
}
function saveCustomerModal() {
  const name = $('edit-cust-name').value.trim();
  const phone = $('edit-cust-phone').value.trim();
  const address = $('edit-cust-address').value.trim();
  if (!name) { toast(t('toast_fill_customer')); return; }
  if (editingCustomerId) {
    const c = DB.customers.find(x => x.id === editingCustomerId);
    if (c) { c.name = name; c.phone = phone; c.address = address; }
  } else {
    DB.customers.push({ id: uid(), name, phone, address, createdAt: new Date().toISOString() });
  }
  saveDB();
  $('modal-customer-edit').classList.remove('show');
  renderCustomers();
  toast(t('toast_customer_saved'));
}
function deleteCustomer(id) {
  if (!confirm(t('confirm_delete_customer'))) return;
  DB.customers = DB.customers.filter(x => x.id !== id);
  saveDB();
  renderCustomers();
  toast(t('toast_customer_deleted'));
}

/* ---------- 选择客户弹窗 ---------- */
function openCustomerPicker() {
  renderCustomerPicker();
  $('modal-customer').classList.add('show');
}
function renderCustomerPicker() {
  const list = $('modal-customer-list');
  const kw = ($('modal-customer-search').value || '').trim().toLowerCase();
  const arr = DB.customers.filter(c => !kw || c.name.toLowerCase().includes(kw) || c.phone.includes(kw));
  $('modal-customer-empty').style.display = arr.length ? 'none' : 'block';
  list.innerHTML = arr.map(c => `
    <div class="customer-item" onclick="pickCustomer('${c.id}')">
      <div class="name">${esc(c.name)}</div>
      <div class="meta">${esc(c.phone || '')}${c.address ? ' · ' + esc(c.address) : ''}</div>
    </div>`).join('');
}
function pickCustomer(id) {
  const c = DB.customers.find(x => x.id === id);
  if (!c) return;
  $('cust-name').value = c.name;
  $('cust-phone').value = c.phone || '';
  $('cust-address').value = c.address || '';
  $('modal-customer').classList.remove('show');
  toast(c.name);
}

/* ---------- 设置 ---------- */
function loadSettingsForm() {
  const s = DB.settings;
  const co = s.company;
  $('set-company-name').value = co.name || '';
  $('set-company-tag').value = co.tag_zh || '';
  $('set-company-address').value = co.address || '';
  $('set-company-phone').value = co.phone || '';
  $('set-company-email').value = co.email || '';
  $('set-company-web').value = co.web || '';
  $('set-company-tax').value = co.tax || '';
  $('set-company-kvk').value = co.kvk || '';
  $('set-company-bank').value = co.bank || '';
  $('set-company-bank-holder').value = co.bank_holder || '';
  $('set-inv-prefix').value = s.invPrefix;
  $('set-inv-next').value = s.nextNo;
  if ($('set-vat-rate')) $('set-vat-rate').value = s.vatRate != null ? s.vatRate : 10;
  if ($('set-lang')) $('set-lang').value = currentLang || s.lang || 'nl';
}
function saveSettingsForm() {
  const newLang = $('set-lang') ? $('set-lang').value : 'nl';
  saveSettings({
    company: {
      name: $('set-company-name').value.trim(),
      tag_zh: $('set-company-tag').value.trim(),
      tag_nl: $('set-company-tag').value.trim(),
      address: $('set-company-address').value.trim(),
      phone: $('set-company-phone').value.trim(),
      email: $('set-company-email').value.trim(),
      web: $('set-company-web').value.trim(),
      tax: $('set-company-tax').value.trim(),
      kvk: $('set-company-kvk').value.trim(),
      bank: $('set-company-bank').value.trim(),
      bank_holder: $('set-company-bank-holder').value.trim()
    },
    invPrefix: $('set-inv-prefix').value.trim(),
    nextNo: parseInt($('set-inv-next').value) || 1,
    vatRate: parseFloat($('set-vat-rate').value) >= 0 ? parseFloat($('set-vat-rate').value) : 10,
    lang: newLang
  });
  setLang(newLang);  // 立即切换界面语言
  toast(t('toast_settings'));
}

/* ---------- 数据导入导出 ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'panda_invoice_backup_' + todayStr() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast(t('toast_exported'));
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || !Array.isArray(data.invoices)) throw new Error('bad');
      DB = {
        invoices: data.invoices || [],
        customers: data.customers || [],
        settings: Object.assign({}, DEFAULT_SETTINGS, data.settings || {})
      };
      DB.settings.company = Object.assign({}, DEFAULT_SETTINGS.company, (DB.settings.company || {}));
      saveDB();
      toast(t('toast_imported'));
    } catch (err) {
      toast(t('toast_import_fail'));
    }
  };
  reader.readAsText(file);
}

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg) {
  let el = $('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- 初始化 ---------- */
/* ---------- 登录保护 ---------- */
const LOGIN_USER = 'panda';
const LOGIN_PASS = 'Panda170810';
const AUTH_KEY = 'panda_invoice_auth';
const AUTH_DAYS = 7; // 登录有效期 7 天

function checkAuth() {
  const mask = $('login-mask');
  if (!mask) return;
  try {
    const saved = localStorage.getItem(AUTH_KEY);
    if (saved) {
      const t = JSON.parse(saved);
      if (t.user === LOGIN_USER && Date.now() - t.at < AUTH_DAYS * 864e5) {
        mask.classList.add('hidden');
        return;
      }
    }
  } catch (e) {}
  mask.classList.remove('hidden');
  // 聚焦输入框
  const u = $('login-user');
  if (u) setTimeout(() => u.focus(), 50);
}

function doLogin() {
  const u = ($('login-user').value || '').trim();
  const p = $('login-pass').value || '';
  if (u === LOGIN_USER && p === LOGIN_PASS) {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ user: u, at: Date.now() }));
    $('login-mask').classList.add('hidden');
    $('login-err').textContent = '';
    $('login-pass').value = '';
  } else {
    $('login-err').textContent = currentLang === 'nl' ? 'Ongeldige inloggegevens' : '账户名或密码错误';
  }
}

function init() {
  checkAuth();
  loadDB();
  seedDemoData();
  // 从云端拉取数据（若云端更新则覆盖，稍后刷新界面）
  cloudPull().then(updated => {
    if (updated) {
      const s2 = DB.settings;
      setLang(s2.lang || 'nl');
      renderRecords(); renderStats(); renderCustomers();
      if ($('view-records').classList.contains('active')) { renderRecords(); renderStats(); }
    }
  });
  const s = DB.settings;
  // 语言（默认荷兰文）
  const lang = s.lang || 'nl';
  setLang(lang);
  // 货币
  $('invoice-currency').value = 'SRD';
  editing.currency = 'SRD';
  // 日期
  $('inv-date').value = todayStr();
  $('inv-due').value = addDaysStr(7);
  // 发票号
  const prefix = s.invPrefix || 'INV-';
  $('inv-number').value = prefix + new Date().getFullYear() + '-' + String(s.nextNo).padStart(4, '0');

  // 发票记录年月默认选当月
  const now = new Date();
  $('record-year').value = String(now.getFullYear());
  $('record-month').value = String(now.getMonth() + 1);

  // 事件绑定
  // 登录
  $('btn-login').addEventListener('click', doLogin);
  $('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('login-user').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.addEventListener('click', () => switchView(b.dataset.view));
  });
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.addEventListener('click', () => setLang(b.dataset.lang));
  });
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => $(btn.dataset.close).classList.remove('show'));
  });
  $('invoice-currency').addEventListener('change', e => {
    editing.currency = e.target.value;
    renderDoors(); renderOthers(); renderSummary();
  });
  $('inv-discount').addEventListener('input', e => {
    editing.discount = parseFloat(e.target.value) || 0;
    renderSummary();
  });
  $('inv-payment').addEventListener('change', () => {
    editing.payment = $('inv-payment').value;
    renderReceivedHints();
  });
  $('inv-received-deposit').addEventListener('input', () => { editing.receivedDeposit = parseFloat($('inv-received-deposit').value) || 0; });
  $('inv-received-balance').addEventListener('input', () => { editing.receivedBalance = parseFloat($('inv-received-balance').value) || 0; });
  $('btn-deposit-full').addEventListener('click', () => {
    const d = dueAmounts();
    $('inv-received-deposit').value = Math.round(d.deposit);
    editing.receivedDeposit = Math.round(d.deposit);
  });
  $('btn-balance-full').addEventListener('click', () => {
    const d = dueAmounts();
    $('inv-received-balance').value = Math.round(d.balance);
    editing.receivedBalance = Math.round(d.balance);
  });
  $('btn-add-door').addEventListener('click', addDoor);
  $('btn-add-other').addEventListener('click', addOther);
  $('btn-clear').addEventListener('click', () => {
    if (!confirm('确定清空当前发票编辑内容？')) return;
    editing.doors = []; editing.others = [];
    $('cust-name').value = ''; $('cust-phone').value = ''; $('cust-address').value = '';
    $('inv-notes').value = ''; $('inv-discount').value = 0; editing.discount = 0;
    $('inv-received-deposit').value = 0; $('inv-received-balance').value = 0;
    $('inv-deposit-date').value = ''; $('inv-balance-date').value = '';
    editing.receivedDeposit = 0; editing.receivedBalance = 0;
    const s2 = DB.settings;
    $('inv-number').value = (s2.invPrefix || 'INV-') + new Date().getFullYear() + '-' + String(s2.nextNo).padStart(4, '0');
    $('inv-date').value = todayStr(); $('inv-due').value = addDaysStr(7);
    renderDoors(); renderOthers();
  });
  $('btn-save').addEventListener('click', saveInvoice);
  $('btn-print').addEventListener('click', () => {
    const inv = collectInvoice();
    printInvoice(inv);
  });
  // 记录（年月变化时列表+统计一起刷新）
  $('record-search').addEventListener('input', renderRecords);
  $('record-year').addEventListener('change', () => { renderRecords(); renderStats(); });
  $('record-month').addEventListener('change', () => { renderRecords(); renderStats(); });
  // 客户
  $('customer-search').addEventListener('input', renderCustomers);
  $('cust-year').addEventListener('change', renderCustomers);
  $('cust-month').addEventListener('change', renderCustomers);
  $('btn-add-customer').addEventListener('click', addCustomer);
  $('btn-save-customer').addEventListener('click', saveCustomerModal);
  $('btn-del-customer').addEventListener('click', () => {
    if (editingCustomerId) deleteCustomer(editingCustomerId);
    $('modal-customer-edit').classList.remove('show');
  });
  $('btn-customer-pick').addEventListener('click', openCustomerPicker);
  $('modal-customer-search').addEventListener('input', renderCustomerPicker);
  // 设置
  $('btn-save-settings').addEventListener('click', saveSettingsForm);
  $('btn-export').addEventListener('click', exportData);
  $('btn-import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', e => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });
  // 弹窗遮罩点击关闭
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('mousedown', e => {
      if (e.target === m) m.classList.remove('show');
    });
  });

  // 初始添加一扇门，方便直接开用
  addDoor();
  renderSummary();
}

document.addEventListener('DOMContentLoaded', init);
