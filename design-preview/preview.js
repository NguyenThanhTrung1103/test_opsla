/**
 * Oops La Book Store — Claude Design System Interactive Controller
 * High-fidelity Prototype & Preview Engine
 */

// 1. Domain Data & Seed Assets
const SEED_BOOKS = [
  {
    id: 'ols-book-01',
    title: 'Graphic Anatomy Atelier Bow-Wow',
    subtitle: 'Sectional Perspective & Spatial Anatomy',
    author: 'Yoshiharu Tsukamoto, Momoyo Kaijima',
    publisher: 'TOTO Publishing (Tokyo)',
    isbn: '978-4-88706-278-8',
    publicationYear: 2007,
    bookSize: 'STANDARD',
    dimensionsText: '260 × 260 mm (Square Quadrate)',
    priceVND: 1250000,
    stockCount: 3,
    status: 'IN_STOCK',
    coverImage: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80',
    description: 'Ấn bản kinh điển trình bày 43 công trình nhà ở của Atelier Bow-Wow qua các bản vẽ mặt cắt phối cảnh (Sectional Perspective) tỷ lệ 1:20 vẽ tay hoàn toàn. Từng chi tiết đồ đạc, nếp sinh hoạt và vật liệu được bóc tách với độ chuẩn xác vi mô.',
    category: 'Monograph',
    featured: true,
    condition: 'Ấn bản nhập khẩu mới 100% nguyên màng co nhiệt (shrink-wrapped). Bìa áo in dập nổi hoàn hảo, ruột giấy mỹ thuật Nhật Bản không tì vết.',
    tags: ['Atelier Bow-Wow', 'Sectional Perspective', '1:20', 'Tokyo Housing', 'Japanese Architecture'],
    spreads: [
      {
        title: '01. Cover Plate — Dust Jacket & Isometric Plan',
        scale: 'Cover Spec',
        type: 'isometric',
        description: 'Bản vẽ phối cảnh đẳng cự toàn bộ cụm nhà phố Tokyo với hệ số sử dụng đất siêu vi mô.'
      },
      {
        title: '02. Sectional Perspective 1:20 — House & Atelier Bow-Wow',
        scale: '1:20 Technical Section',
        type: 'section',
        description: 'Mặt cắt phối cảnh xuyên suốt 4 tầng hầm và nổi, bộc lộ kết cấu khung thép và các bậc thang lệch tầng.'
      },
      {
        title: '03. Joinery Details & Living Anatomy 1:10',
        scale: '1:10 Detail',
        type: 'detail',
        description: 'Chi tiết mối nối mộng gỗ truyền thống kết hợp hệ bulong cường độ cao neo vào dầm thép I.'
      }
    ]
  },
  {
    id: 'ols-book-02',
    title: 'Graphic Anatomy Atelier Bow-Wow 2',
    subtitle: 'Collective Housing & Urban Architecture',
    author: 'Yoshiharu Tsukamoto, Momoyo Kaijima',
    publisher: 'TOTO Publishing (Tokyo)',
    isbn: '978-4-88706-340-2',
    publicationYear: 2014,
    bookSize: 'STANDARD',
    dimensionsText: '260 × 260 mm (Square Quadrate)',
    priceVND: 1450000,
    stockCount: 1,
    status: 'ONE_COPY_LEFT',
    coverImage: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=800&q=80',
    description: 'Phần hai tiếp nối công trình giải phẫu không gian, mở rộng từ nhà ở riêng lẻ sang các tổ hợp nhà ở tập thể, công trình công cộng và không gian sinh hoạt cộng đồng tại Tokyo.',
    category: 'Technical Drawings',
    featured: false,
    condition: 'Chỉ còn 01 bản duy nhất tại kho lưu trữ. Góc gáy sách sắc nét, giấy trắng nguyên bản.',
    tags: ['Atelier Bow-Wow', 'Collective Housing', 'Urban Ecology']
  },
  {
    id: 'ols-book-03',
    title: 'Tadao Ando: Complete Works 1975–Today (XXL Collector Edition)',
    subtitle: 'TASCHEN SUMO Edition with Architectural Stand',
    author: 'Philip Jodidio, Tadao Ando',
    publisher: 'TASCHEN (Köln)',
    isbn: '978-3-8365-5240-0',
    publicationYear: 2019,
    bookSize: 'SUMO',
    dimensionsText: '390 × 540 mm (SUMO Oversized, 18.5 kg)',
    priceVND: 38000000,
    stockCount: 1,
    status: 'ONE_COPY_LEFT',
    coverImage: 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&w=800&q=80',
    description: 'Ấn bản SUMO khổ cực đại có chữ ký khắc laser của Tadao Ando, đi kèm giá đỡ sách thiết kế độc bản. Tuyển tập toàn bộ công trình bê tông trần danh tiếng như Church of the Light, Naoshima Benesse House.',
    category: 'Sumo Edition',
    featured: true,
    condition: 'Nguyên kiện thùng gỗ bảo hiểm TASCHEN chính hãng, số thứ tự lưu trữ No. 0482/1000 có chứng thư xác thực.',
    tags: ['Tadao Ando', 'TASCHEN', 'SUMO', 'Collector Edition', 'Raw Concrete']
  },
  {
    id: 'ols-book-04',
    title: 'Pet Architecture Guide Book',
    subtitle: 'Living Spheres on Micro Urban Leftovers in Tokyo',
    author: 'Atelier Bow-Wow + Tokyo Institute of Technology',
    publisher: 'World Photo Press',
    isbn: '978-4-87275-103-1',
    publicationYear: 2002,
    bookSize: 'STANDARD',
    dimensionsText: '130 × 190 mm (Pocket Manifesto)',
    priceVND: 850000,
    stockCount: 2,
    status: 'IN_STOCK',
    coverImage: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=800&q=80',
    description: 'Khảo sát 79 công trình kiến trúc "thú cưng" kỳ dị được xây dựng trên những mảnh đất thừa, kẹt giữa đường cao tốc và khe hẹp đô thị Tokyo.',
    category: 'Urban Theory',
    featured: false,
    condition: 'Tình trạng bảo quản xuất sắc trong phòng kiểm soát độ ẩm 50% RH. Ruột sách nguyên vẹn.',
    tags: ['Micro Architecture', 'Tokyo', 'Pet Architecture', 'Urban Ecology']
  },
  {
    id: 'ols-book-05',
    title: 'Made in Tokyo: Architectural Guide',
    subtitle: 'Guide Book for Hybrid Urban Phenomenon',
    author: 'Momoyo Kaijima, Junzo Kuroda, Yoshiharu Tsukamoto',
    publisher: 'Kajima Institute Publishing',
    isbn: '978-4-306-04423-4',
    publicationYear: 2001,
    bookSize: 'STANDARD',
    dimensionsText: '150 × 210 mm',
    priceVND: 720000,
    stockCount: 0,
    status: 'SOLD_OUT',
    coverImage: 'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=800&q=80',
    description: 'Bản hướng dẫn các công trình lai ghép vô thức tại Tokyo: bãi tập golf trên nóc siêu thị, đường cao tốc đâm xuyên cao ốc. Đã bán hết bản in cuối cùng.',
    category: 'Urban Theory',
    featured: false,
    condition: 'Đã tạm hết hàng tại kho Oops La. Quý nhà sưu tầm có thể để lại yêu cầu tìm kiếm.',
    tags: ['Tokyo', 'Hybrid Architecture', 'Found Objects']
  },
  {
    id: 'ols-book-06',
    title: 'Architectural Ethnography: Atelier Bow-Wow',
    subtitle: '16th International Architecture Exhibition La Biennale di Venezia',
    author: 'Yoshiharu Tsukamoto, Momoyo Kaijima, Chika Kijima',
    publisher: 'TOTO Publishing (Tokyo)',
    isbn: '978-4-88706-373-0',
    publicationYear: 2018,
    bookSize: 'STANDARD',
    dimensionsText: '210 × 297 mm (A4 Landscape)',
    priceVND: 1650000,
    stockCount: 4,
    status: 'IN_STOCK',
    coverImage: 'https://images.unsplash.com/photo-1532012164546-f432f2e3777a?auto=format&fit=crop&w=800&q=80',
    description: 'Ấn phẩm chính thức đại diện gian triển lãm Nhật Bản tại Venice Biennale 2018, phân tích cách thức quan sát dân tộc học kiến trúc qua các bản vẽ tay và nghiên cứu thực địa.',
    category: 'Technical Drawings',
    featured: false,
    condition: 'Bản in khổ ngang tiêu chuẩn triển lãm, giấy nặng không tráng phủ, độ mở 180 độ phẳng tuyệt đối.',
    tags: ['Venice Biennale', 'Ethnography', 'Fieldwork', 'Hand Drawing']
  }
];

const SEED_ARTICLES = [
  {
    id: 'ols-art-01',
    title: 'Atelier Bow-Wow và Nghệ Thuật Giải Phẫu Không Gian 1:20',
    date: '01 Thg 11, 2026',
    readTime: '6 phút đọc',
    author: 'Giám tuyển Oops La',
    excerpt: 'Tại sao bản vẽ mặt cắt phối cảnh (Sectional Perspective) tỷ lệ 1:20 lại trở thành ngôn ngữ định danh cho trường phái kiến trúc hành vi Tokyo?',
    content: `Trong thế giới của chuyên khảo kiến trúc, ít có cuốn sách nào tạo ra cú hích thị giác và phương pháp luận mạnh mẽ như "Graphic Anatomy Atelier Bow-Wow" do TOTO Publishing xuất bản năm 2007.

Không giống các bản vẽ kiến trúc thương mại trau chuốt bằng phần mềm render 3D bóng bẩy nhưng vô hồn, Yoshiharu Tsukamoto và Momoyo Kaijima chọn một lối đi khổ hạnh: vẽ tay toàn bộ mặt cắt phối cảnh với tỷ lệ cố định 1:20.

Ở tỷ lệ 1:20, kiến trúc không còn là hình khối trừu tượng mà trở thành "giải phẫu học không gian" (Spatial Anatomy). Người đọc có thể nhìn thấy độ dày của lớp ván sàn 15mm, vị trí mối nối thép mạ kẽm, và thậm chí cả chiếc ấm đun nước trên bệ bếp. Đó là nơi kiến trúc và cuộc sống thường nhật hòa làm một thể hữu cơ.`
  },
  {
    id: 'ols-art-02',
    title: 'TASCHEN SUMO Edition: Khi Cuốn Sách Trở Thành Khối Điêu Khắc Độc Lập',
    date: '03 Thg 11, 2026',
    readTime: '8 phút đọc',
    author: 'KTS. Lê Quang (Khách mời)',
    excerpt: 'Khảo sát ấn bản Tadao Ando XXL nặng 18.5kg và triết lý "Cuốn sách không chỉ để đọc, mà là một vật thể kiến trúc trong không gian sống".',
    content: `Được sáng lập bởi Benedikt Taschen năm 1999 với ấn bản đầu tiên của Helmut Newton, định dạng SUMO đã định nghĩa lại ranh giới giữa một cuốn sách và một tác phẩm nghệ thuật trưng bày.

Với ấn phẩm "Tadao Ando: Complete Works XXL", cuốn sách vượt qua kích thước thông thường (390 x 540 mm) để phản ánh trung thực quy mô các công trình bê tông trần của kiến trúc sư đoạt giải Pritzker. Mỗi trang mở ra như một bức tường bảo tàng thu nhỏ, đòi hỏi người xem phải tương tác vật lý bằng cả cơ thể để lật mở.`
  }
];

const SEED_ORDERS = [
  {
    id: 'OLS-261101',
    createdAt: '2026-11-04T10:15:00Z',
    customer: {
      fullName: 'Trần Minh Hoàng',
      phone: '0912345678',
      address: 'Phòng 402, Tòa nhà Indochina, 4 Nguyễn Đình Chiểu, Quận 1, TP. Hồ Chí Minh',
      notes: 'Giao giờ hành chính, gọi trước 15 phút để bảo vệ nhận.'
    },
    items: [
      { bookId: 'ols-book-01', bookTitle: 'Graphic Anatomy Atelier Bow-Wow', quantity: 1, unitPriceVND: 1250000 }
    ],
    subtotalVND: 1250000,
    status: 'PENDING_CONTACT',
    stale48h: true // Created >48h ago and still uncontacted
  },
  {
    id: 'OLS-261102',
    createdAt: '2026-11-06T14:20:00Z',
    customer: {
      fullName: 'Nguyễn Thị Bích Ngọc',
      phone: '0988765432',
      address: 'Biệt thự 12A, Khu đô thị Ciputra, Tây Hồ, Hà Nội',
      notes: 'Đóng gói cẩn thận 2 lớp bóng khí bảo vệ góc sách.'
    },
    items: [
      { bookId: 'ols-book-03', bookTitle: 'Tadao Ando: Complete Works XXL', quantity: 1, unitPriceVND: 38000000 }
    ],
    subtotalVND: 38000000,
    status: 'CONTACTED',
    stale48h: false
  },
  {
    id: 'OLS-261103',
    createdAt: '2026-11-07T09:30:00Z',
    customer: {
      fullName: 'Vũ Đức Thành',
      phone: '0903112233',
      address: 'Studio Kiến Trúc V+A, 84 Pasteur, P. Bến Nghé, Quận 1, TP. Hồ Chí Minh',
      notes: 'Xuất hóa đơn VAT cho công ty kiến trúc.'
    },
    items: [
      { bookId: 'ols-book-02', bookTitle: 'Graphic Anatomy Atelier Bow-Wow 2', quantity: 1, unitPriceVND: 1450000 },
      { bookId: 'ols-book-04', bookTitle: 'Pet Architecture Guide Book', quantity: 1, unitPriceVND: 850000 }
    ],
    subtotalVND: 2300000,
    status: 'CONFIRMED',
    stale48h: false
  }
];

// 2. Application State Store
const state = {
  books: [...SEED_BOOKS],
  articles: [...SEED_ARTICLES],
  orders: [...SEED_ORDERS],
  cart: [
    { bookId: 'ols-book-01', quantity: 1 }
  ],
  activeCategory: 'ALL',
  activeSize: 'ALL',
  searchQuery: '',
  heroFeaturedBookId: 'ols-book-01',
  heroActivePlate: 'jacket', // 'jacket' | 'blue' | 'section'
  activeModalBook: null,
  activeSpreadIndex: 0,
  spreadZoomLevel: 1.0,
  adminRole: 'OWNER', // 'OWNER' | 'STAFF'
  activeAdminTab: 'dashboard'
};

// 3. Currency Formatter (Strict Single Currency VNĐ - CURR-01)
function formatVND(amount) {
  if (amount === null || amount === undefined) return '0 VNĐ';
  return new Intl.NumberFormat('vi-VN').format(amount) + ' VNĐ';
}

// 4. Hero Section Handlers
function switchHeroFeaturedBook(bookId) {
  state.heroFeaturedBookId = bookId;
  state.heroActivePlate = 'jacket';
  renderHeroShowcase();
}

function switchHeroPlate(plateKey) {
  state.heroActivePlate = plateKey;
  renderHeroPlateVisual();
}

function renderHeroShowcase() {
  const book = state.books.find(b => b.id === state.heroFeaturedBookId) || state.books[0];
  const titleEl = document.getElementById('heroBookTitle');
  const quoteEl = document.getElementById('heroBookQuote');
  const dimsEl = document.getElementById('heroSpecDims');
  const pagesEl = document.getElementById('heroSpecPages');
  const priceEl = document.getElementById('heroSpecPrice');
  const publisherEl = document.getElementById('heroPublisherBadge');

  if (titleEl) titleEl.textContent = book.title;
  if (quoteEl) quoteEl.textContent = book.description;
  if (dimsEl) dimsEl.textContent = book.dimensionsText;
  if (pagesEl) pagesEl.textContent = book.bookSize === 'SUMO' ? '740 Pages / 18.5 kg' : '156 Pages / 24 Houses';
  if (priceEl) priceEl.textContent = formatVND(book.priceVND);
  if (publisherEl) publisherEl.textContent = book.publisher.toUpperCase();

  renderHeroPlateVisual();
}

function renderHeroPlateVisual() {
  const container = document.getElementById('heroStageVisualContainer');
  if (!container) return;

  const book = state.books.find(b => b.id === state.heroFeaturedBookId) || state.books[0];
  const plate = state.heroActivePlate;

  // Active buttons state
  ['jacket', 'blue', 'section'].forEach(p => {
    const btn = document.getElementById('heroBtn-' + p);
    if (btn) {
      if (p === plate) {
        btn.className = 'px-3 py-1.5 text-xs font-mono font-medium bg-stone-900 text-stone-50 rounded-md transition-all shadow-xs';
      } else {
        btn.className = 'px-3 py-1.5 text-xs font-mono font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-all';
      }
    }
  });

  let svgContent = '';
  if (plate === 'jacket') {
    svgContent = `
      <div class="relative w-full h-full flex items-center justify-center p-6 bg-stone-100/60 rounded-xl overflow-hidden border border-stone-200/80">
        <div class="relative w-72 h-72 sm:w-80 sm:h-80 bg-stone-50 rounded-md shadow-book transition-transform duration-300 hover:scale-[1.02] flex flex-col justify-between p-6 border border-stone-300/80">
          <div class="book-spine-accent"></div>
          <div class="flex justify-between items-start">
            <span class="text-[10px] font-mono tracking-widest text-stone-400">TOTO PUBLISHING</span>
            <span class="text-[9px] font-mono bg-amber-50 text-amber-800 border border-amber-200/70 px-1.5 py-0.5 rounded">1:20 SCALE</span>
          </div>
          <div class="text-center my-auto">
            <div class="text-[13px] font-mono tracking-widest text-stone-500 mb-1">図解 アトリエ・ワン</div>
            <h3 class="font-serif text-2xl font-bold tracking-tight text-stone-900 leading-snug">GRAPHIC ANATOMY<br/>ATELIER BOW-WOW</h3>
          </div>
          <div class="pt-4 border-t border-stone-200 flex justify-between items-end text-[11px] font-mono text-stone-500">
            <span>ISBN 978-4-88706</span>
            <span class="font-semibold text-stone-900 tabular-nums">260 × 260 mm</span>
          </div>
        </div>
      </div>
    `;
  } else if (plate === 'blue') {
    svgContent = `
      <div class="relative w-full h-full flex items-center justify-center p-6 bg-sky-950/5 rounded-xl overflow-hidden border border-sky-100">
        <div class="relative w-72 h-72 sm:w-80 sm:h-80 bg-sky-900 rounded-md shadow-book flex flex-col justify-between p-6 border border-sky-950/40 text-sky-100">
          <div class="book-spine-accent"></div>
          <span class="text-[10px] font-mono tracking-widest text-sky-300/80 uppercase">Cerulean Cloth Hardcover</span>
          <div class="text-center my-auto">
            <div class="w-16 h-16 mx-auto mb-3 border border-amber-300/40 rounded-full flex items-center justify-center text-amber-300">
              <span class="font-serif text-lg italic">弓</span>
            </div>
            <div class="font-serif text-xl tracking-wider text-amber-200 font-medium">ATELIER BOW-WOW</div>
            <div class="text-[11px] font-mono text-sky-200/70 mt-1">COLLECTOR ARCHIVE CLOTH</div>
          </div>
          <div class="text-[10px] font-mono text-sky-300/60 text-center">TOTO ARCHITECTURAL MONOGRAPHS</div>
        </div>
      </div>
    `;
  } else {
    svgContent = `
      <div class="relative w-full h-full flex items-center justify-center p-6 bg-stone-100/60 rounded-xl overflow-hidden border border-stone-200/80">
        <div class="relative w-full max-w-md h-72 sm:h-80 bg-white rounded-md shadow-book flex flex-col p-4 border border-stone-300/80">
          <div class="flex justify-between items-center text-[10px] font-mono text-stone-500 pb-2 border-b border-stone-200">
            <span class="text-rose-600 font-semibold">SECTION 1:20 — HOUSE & ATELIER</span>
            <span>PLATE NO. 04</span>
          </div>
          <div class="flex-1 my-2 border border-dashed border-stone-200 rounded flex items-center justify-center bg-stone-50/50 p-2 relative overflow-hidden">
            <svg class="w-full h-full text-stone-700" viewBox="0 0 200 120" fill="none" stroke="currentColor" stroke-width="1.2">
              <path d="M20 100 L20 40 L60 20 L140 20 L180 40 L180 100 Z" stroke-dasharray="2 1" />
              <line x1="20" y1="70" x2="180" y2="70" stroke-width="1" />
              <line x1="60" y1="20" x2="60" y2="100" stroke-width="0.8" />
              <line x1="100" y1="20" x2="100" y2="100" stroke-width="0.8" />
              <line x1="140" y1="20" x2="140" y2="100" stroke-width="0.8" />
              <circle cx="80" cy="55" r="4" stroke="#C2410C" />
              <text x="90" y="58" font-size="6" font-family="monospace" fill="#C2410C">Joinery 1:10</text>
            </svg>
          </div>
          <div class="text-[10px] font-mono text-stone-400 text-center">CLICK TO OPEN CONTINUOUS VERTICAL VIEWER</div>
        </div>
      </div>
    `;
  }

  container.innerHTML = svgContent;
}

// 5. Catalog Search & Filter Engine
function setCategory(cat) {
  state.activeCategory = cat;
  renderCatalogPills();
  renderBooksGrid();
}

function setSizeFilter(size) {
  state.activeSize = size;
  renderCatalogPills();
  renderBooksGrid();
}

function handleSearch(query) {
  state.searchQuery = (query || '').trim().toLowerCase();
  renderBooksGrid();
}

function renderCatalogPills() {
  const categories = ['ALL', 'Monograph', 'Technical Drawings', 'Urban Theory', 'Sumo Edition'];
  const catContainer = document.getElementById('catalogCategoryPills');
  if (catContainer) {
    catContainer.innerHTML = categories.map(cat => {
      const active = state.activeCategory === cat;
      const label = cat === 'ALL' ? 'Tất cả ấn bản' : cat;
      return `
        <button onclick="setCategory('${cat}')" class="px-3.5 py-1.5 text-xs font-mono font-medium rounded-full transition-all ${
          active 
            ? 'bg-stone-900 text-white shadow-xs' 
            : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70 hover:text-stone-900'
        }">
          ${label}
        </button>
      `;
    }).join('');
  }

  const sizes = ['ALL', 'STANDARD', 'SUMO'];
  const sizeContainer = document.getElementById('catalogSizePills');
  if (sizeContainer) {
    sizeContainer.innerHTML = sizes.map(size => {
      const active = state.activeSize === size;
      const label = size === 'ALL' ? 'Mọi kích thước' : size === 'SUMO' ? 'Khổ lớn SUMO' : 'Khổ tiêu chuẩn';
      return `
        <button onclick="setSizeFilter('${size}')" class="px-3 py-1 text-xs font-mono font-medium rounded-md transition-all ${
          active
            ? 'border border-stone-800 bg-stone-50 text-stone-900 font-semibold'
            : 'border border-stone-200 text-stone-500 hover:border-stone-400 hover:text-stone-800'
        }">
          ${label}
        </button>
      `;
    }).join('');
  }
}

function renderBooksGrid() {
  const gridContainer = document.getElementById('booksGridContainer');
  if (!gridContainer) return;

  const filtered = state.books.filter(book => {
    // Category match
    if (state.activeCategory !== 'ALL' && book.category !== state.activeCategory) return false;
    // Size match
    if (state.activeSize !== 'ALL' && book.bookSize !== state.activeSize) return false;
    // Search match
    if (state.searchQuery) {
      const q = state.searchQuery;
      const matchTitle = book.title.toLowerCase().includes(q);
      const matchAuthor = book.author.toLowerCase().includes(q);
      const matchIsbn = book.isbn.toLowerCase().includes(q);
      const matchTag = book.tags.some(t => t.toLowerCase().includes(q));
      if (!matchTitle && !matchAuthor && !matchIsbn && !matchTag) return false;
    }
    return true;
  });

  const countBadge = document.getElementById('catalogCountLabel');
  if (countBadge) {
    countBadge.textContent = `HIỂN THỊ ${filtered.length} / ${state.books.length} ẤN BẢN KIẾN TRÚC`;
  }

  if (filtered.length === 0) {
    gridContainer.innerHTML = `
      <div class="col-span-full py-16 text-center bg-stone-50 rounded-xl border border-stone-200">
        <p class="font-serif text-xl text-stone-600 mb-2">Không tìm thấy ấn phẩm kiến trúc phù hợp</p>
        <p class="text-xs font-mono text-stone-400">Thử tìm bằng tên kiến trúc sư, số ISBN hoặc xóa bộ lọc.</p>
        <button onclick="setCategory('ALL'); setSizeFilter('ALL'); handleSearch('');" class="mt-4 px-4 py-2 text-xs font-mono bg-stone-900 text-white rounded-md hover:bg-stone-800 transition">
          Xóa tất cả bộ lọc
        </button>
      </div>
    `;
    return;
  }

  gridContainer.innerHTML = filtered.map(book => {
    let stockBadge = '';
    if (book.status === 'IN_STOCK') {
      stockBadge = `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Còn hàng (${book.stockCount})</span>`;
    } else if (book.status === 'ONE_COPY_LEFT') {
      stockBadge = `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-amber-50 text-amber-700 border border-amber-200/80"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Chỉ còn 1 cuốn</span>`;
    } else {
      stockBadge = `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-stone-100 text-stone-500 border border-stone-200"><span class="w-1.5 h-1.5 rounded-full bg-stone-400"></span>Tạm hết</span>`;
    }

    const isSumo = book.bookSize === 'SUMO';

    return `
      <article class="book-card-presentation flex flex-col justify-between group">
        <!-- Visual Cover Container -->
        <div class="relative bg-stone-100 aspect-4/3 sm:aspect-square overflow-hidden cursor-pointer flex items-center justify-center p-6" onclick="openLookInsideModal('${book.id}')">
          <img src="${book.coverImage}" alt="${book.title}" class="max-h-full max-w-full object-contain shadow-book transition-transform duration-300 group-hover:scale-105 group-hover:shadow-book-hover rounded-xs" />
          <div class="absolute top-3 left-3 flex flex-col gap-1">
            ${stockBadge}
            ${isSumo ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-stone-900 text-amber-200 border border-amber-300/30 uppercase">TASCHEN SUMO</span>' : ''}
          </div>
          <button class="absolute bottom-3 right-3 px-3 py-1.5 text-xs font-mono font-medium bg-white/90 hover:bg-white text-stone-900 rounded-md shadow-sm backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            Xem bản vẽ 1:20
          </button>
        </div>

        <!-- Book Meta -->
        <div class="p-5 flex-1 flex flex-col justify-between bg-white">
          <div>
            <div class="flex items-center justify-between text-[11px] font-mono text-stone-400 uppercase tracking-wider mb-1.5">
              <span>${book.category}</span>
              <span class="tabular-nums">${book.publicationYear}</span>
            </div>
            <h3 class="font-serif text-lg font-bold text-stone-900 leading-snug line-clamp-2 mb-1 group-hover:text-amber-800 transition-colors cursor-pointer" onclick="openLookInsideModal('${book.id}')">
              ${book.title}
            </h3>
            <p class="text-xs text-stone-500 font-sans line-clamp-1 mb-2">${book.author}</p>
            <p class="text-[11px] font-mono text-stone-400 line-clamp-1 mb-4">${book.dimensionsText}</p>
          </div>

          <!-- Price & Action Footer -->
          <div class="pt-4 border-t border-stone-100 flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-[10px] font-mono text-stone-400 uppercase tracking-widest">Giá niêm yết</span>
              <span class="font-mono text-sm font-bold text-stone-900 tabular-nums">${formatVND(book.priceVND)}</span>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="openLookInsideModal('${book.id}')" title="Xem thông tin chi tiết và bản vẽ" class="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </button>
              ${book.stockCount > 0 ? `
                <button onclick="addToBag('${book.id}')" class="px-3 py-2 text-xs font-mono font-medium bg-stone-900 hover:bg-amber-900 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-xs">
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                  <span>Thêm vào túi</span>
                </button>
              ` : `
                <button disabled class="px-3 py-2 text-xs font-mono font-medium bg-stone-100 text-stone-400 rounded-lg cursor-not-allowed">
                  Hết hàng
                </button>
              `}
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// 6. Look Inside Continuous Vertical Viewer Modal
function openLookInsideModal(bookId) {
  const book = state.books.find(b => b.id === bookId);
  if (!book) return;
  state.activeModalBook = book;
  state.spreadZoomLevel = 1.0;

  const modal = document.getElementById('lookInsideModal');
  if (!modal) return;

  document.getElementById('modalBookTitle').textContent = book.title;
  document.getElementById('modalBookSubtitle').textContent = book.subtitle;
  document.getElementById('modalBookMeta').textContent = `${book.publisher} • ${book.isbn} • ${book.dimensionsText}`;
  document.getElementById('modalBookPrice').textContent = formatVND(book.priceVND);
  document.getElementById('modalPhysicalCondition').textContent = book.condition;

  // Render continuous vertical spreads
  const spreadsContainer = document.getElementById('modalSpreadsContainer');
  if (spreadsContainer) {
    spreadsContainer.innerHTML = `
      <div class="space-y-8 p-6 flex flex-col items-center">
        <!-- Spread 1: Cover Isometric -->
        <div class="w-full max-w-3xl bg-white border border-stone-200 rounded-xl p-8 shadow-sm flex flex-col items-center text-center">
          <div class="w-full flex justify-between items-center text-xs font-mono text-stone-400 border-b border-stone-100 pb-3 mb-6">
            <span class="font-semibold text-stone-800">PLATE 01 — DUST JACKET & ISOMETRIC MATRIX</span>
            <span>TOTO ARCHITECTURAL ARCHIVE</span>
          </div>
          <img src="${book.coverImage}" alt="Cover Plate" class="max-h-96 object-contain rounded shadow-book mb-4" />
          <p class="font-serif italic text-stone-600 text-sm max-w-xl">Bản vẽ phối cảnh đẳng cự toàn cảnh cấu trúc vi mô Tokyo, tỷ lệ chuẩn xác và hệ thống chú dẫn tay.</p>
        </div>

        <!-- Spread 2: Sectional Perspective 1:20 -->
        <div class="w-full max-w-3xl bg-white border border-stone-200 rounded-xl p-8 shadow-sm flex flex-col items-center text-center">
          <div class="w-full flex justify-between items-center text-xs font-mono text-stone-400 border-b border-stone-100 pb-3 mb-6">
            <span class="font-semibold text-amber-800">PLATE 02 — SECTIONAL PERSPECTIVE 1:20 (BẢN VẼ MẶT CẮT PHỐI CẢNH)</span>
            <span class="bg-amber-50 text-amber-800 px-2 py-0.5 rounded text-[10px]">TỶ LỆ 1:20</span>
          </div>
          <div class="w-full bg-stone-50 border border-stone-200 rounded-lg p-6 flex items-center justify-center min-h-[300px] relative overflow-hidden">
            <svg class="w-full max-w-xl h-64 text-stone-800" viewBox="0 0 400 240" fill="none" stroke="currentColor" stroke-width="1.2">
              <!-- Architectural 1:20 Blueprint Mock -->
              <rect x="40" y="30" width="320" height="180" stroke="#78716C" stroke-width="1" stroke-dasharray="4 2" />
              <line x1="40" y1="90" x2="360" y2="90" stroke="#1C1917" stroke-width="1.5" />
              <line x1="40" y1="150" x2="360" y2="150" stroke="#1C1917" stroke-width="1.5" />
              <!-- Stairs and furniture -->
              <path d="M120 150 L120 120 L150 120 L150 90" stroke="#C2410C" stroke-width="1.5" />
              <line x1="180" y1="90" x2="180" y2="30" stroke="#1C1917" stroke-width="2" />
              <circle cx="240" cy="120" r="12" stroke="#0284C7" stroke-width="1" />
              <text x="240" y="123" font-size="8" font-family="monospace" text-anchor="middle" fill="#0284C7">Spiral Core</text>
              <text x="60" y="55" font-size="9" font-family="monospace" fill="#57534E">Level 3: Atelier Studio (+6.200)</text>
              <text x="60" y="115" font-size="9" font-family="monospace" fill="#57534E">Level 2: Living & Library (+3.100)</text>
              <text x="60" y="175" font-size="9" font-family="monospace" fill="#57534E">Level 1: Entry & Foundation (±0.000)</text>
            </svg>
          </div>
          <p class="font-serif italic text-stone-600 text-sm max-w-xl mt-4">Chi tiết cắt dọc bộc lộ giải phẫu không gian của Atelier Bow-Wow: sự đan xen giữa không gian ở và không gian làm việc.</p>
        </div>
      </div>
    `;
  }

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeLookInsideModal() {
  const modal = document.getElementById('lookInsideModal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
}

function zoomSpread(delta) {
  state.spreadZoomLevel = Math.max(1.0, Math.min(3.0, state.spreadZoomLevel + delta));
  const container = document.getElementById('modalSpreadsContainer');
  if (container) {
    container.style.transform = `scale(${state.spreadZoomLevel})`;
    container.style.transformOrigin = 'top center';
  }
}

function resetSpreadZoom() {
  state.spreadZoomLevel = 1.0;
  const container = document.getElementById('modalSpreadsContainer');
  if (container) {
    container.style.transform = 'scale(1)';
  }
}

// 7. Shopping Bag & Collector Request Flow
function toggleCartDrawer() {
  const drawer = document.getElementById('cartDrawerBackdrop');
  if (drawer) {
    drawer.classList.toggle('hidden');
    renderCart();
  }
}

function addToBag(bookId) {
  const existing = state.cart.find(item => item.bookId === bookId);
  const book = state.books.find(b => b.id === bookId);
  if (!book || book.stockCount <= 0) {
    showToast('Ấn bản này hiện tạm hết hàng');
    return;
  }

  if (existing) {
    if (existing.quantity < book.stockCount) {
      existing.quantity += 1;
      showToast(`Đã cập nhật số lượng: ${book.title}`);
    } else {
      showToast(`Kho chỉ còn ${book.stockCount} ấn bản`);
    }
  } else {
    state.cart.push({ bookId, quantity: 1 });
    showToast(`Đã thêm vào túi: ${book.title}`);
  }

  updateCartBadge();
  renderCart();
  toggleCartDrawer();
}

function updateCartQty(bookId, delta) {
  const item = state.cart.find(i => i.bookId === bookId);
  const book = state.books.find(b => b.id === bookId);
  if (!item || !book) return;

  item.quantity += delta;
  if (item.quantity > book.stockCount) {
    item.quantity = book.stockCount;
    showToast(`Kho chỉ còn ${book.stockCount} ấn bản`);
  }
  if (item.quantity <= 0) {
    state.cart = state.cart.filter(i => i.bookId !== bookId);
    showToast('Đã xóa ấn phẩm khỏi túi sưu tầm');
  }

  updateCartBadge();
  renderCart();
}

function updateCartBadge() {
  const badge = document.getElementById('cartCountBadge');
  const totalItems = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  if (badge) badge.textContent = totalItems;
}

function renderCart() {
  const list = document.getElementById('cartItemsList');
  const subtotalEl = document.getElementById('cartSubtotalAmount');
  if (!list || !subtotalEl) return;

  if (state.cart.length === 0) {
    list.innerHTML = `
      <div class="py-16 text-center">
        <div class="w-12 h-12 mx-auto mb-3 text-stone-300 flex items-center justify-center border border-dashed border-stone-300 rounded-full">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        </div>
        <p class="font-serif text-lg text-stone-600">Túi sưu tầm đang trống</p>
        <p class="text-xs font-mono text-stone-400 mt-1">Chọn ấn bản kiến trúc trong thư mục để yêu cầu giữ bản.</p>
      </div>
    `;
    subtotalEl.textContent = '0 VNĐ';
    return;
  }

  let subtotal = 0;
  list.innerHTML = state.cart.map(item => {
    const book = state.books.find(b => b.id === item.bookId);
    if (!book) return '';
    const itemTotal = (book.priceVND || 0) * item.quantity;
    subtotal += itemTotal;

    return `
      <div class="flex gap-4 py-4 border-b border-stone-100 last:border-b-0">
        <img src="${book.coverImage}" alt="${book.title}" class="w-16 h-16 object-contain bg-stone-50 rounded border border-stone-200 p-1" />
        <div class="flex-1 flex flex-col justify-between">
          <div>
            <h4 class="font-serif text-sm font-semibold text-stone-900 leading-tight">${book.title}</h4>
            <span class="text-[11px] font-mono text-stone-500">${formatVND(book.priceVND)}</span>
          </div>
          <div class="flex items-center justify-between mt-2">
            <div class="flex items-center border border-stone-200 rounded-md">
              <button onclick="updateCartQty('${book.id}', -1)" class="px-2 py-0.5 text-stone-500 hover:text-stone-900 text-xs font-mono">-</button>
              <span class="px-2.5 py-0.5 text-xs font-mono font-semibold tabular-nums text-stone-800">${item.quantity}</span>
              <button onclick="updateCartQty('${book.id}', 1)" class="px-2 py-0.5 text-stone-500 hover:text-stone-900 text-xs font-mono">+</button>
            </div>
            <span class="font-mono text-xs font-semibold text-stone-900 tabular-nums">${formatVND(itemTotal)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  subtotalEl.textContent = formatVND(subtotal);
}

// 8. Checkout Modal & Messenger Copy
function openCheckoutModal() {
  if (state.cart.length === 0) {
    showToast('Vui lòng chọn ít nhất một ấn bản');
    return;
  }
  toggleCartDrawer();
  const modal = document.getElementById('checkoutModal');
  if (modal) modal.classList.remove('hidden');
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkoutModal');
  if (modal) modal.classList.add('hidden');
}

function submitCollectorRequest(event) {
  if (event) event.preventDefault();
  const name = document.getElementById('checkoutFullName')?.value?.trim();
  const phone = document.getElementById('checkoutPhone')?.value?.trim();
  const address = document.getElementById('checkoutAddress')?.value?.trim();
  const notes = document.getElementById('checkoutNotes')?.value?.trim();

  // Vietnamese phone regex validation
  const phoneRegex = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;
  if (!name) {
    alert('Vui lòng nhập họ tên người sưu tầm.');
    return;
  }
  if (!phone || !phoneRegex.test(phone.replace(/\s+/g, ''))) {
    alert('Số điện thoại không hợp lệ. Vui lòng nhập số điện thoại Việt Nam hợp lệ (VD: 0912345678).');
    return;
  }
  if (!address) {
    alert('Vui lòng nhập địa chỉ nhận ấn phẩm.');
    return;
  }

  // Calculate order subtotal
  let subtotal = 0;
  const items = state.cart.map(i => {
    const b = state.books.find(book => book.id === i.bookId);
    const unitPrice = b?.priceVND || 0;
    subtotal += unitPrice * i.quantity;
    return {
      bookId: i.bookId,
      bookTitle: b?.title || '',
      quantity: i.quantity,
      unitPriceVND: unitPrice
    };
  });

  const orderId = 'OLS-' + Math.floor(100000 + Math.random() * 900000);
  const newOrder = {
    id: orderId,
    createdAt: new Date().toISOString(),
    customer: { fullName: name, phone, address, notes },
    items,
    subtotalVND: subtotal,
    status: 'PENDING_CONTACT',
    stale48h: false
  };

  // Invariant BD-04 Guarantee: Zero auto-decrement upon submission
  state.orders.unshift(newOrder);
  state.cart = [];
  updateCartBadge();
  closeCheckoutModal();

  // Open Messenger Export Confirmation
  openMessengerModal(newOrder);
}

function openMessengerModal(order) {
  const modal = document.getElementById('messengerModal');
  if (!modal) return;

  document.getElementById('messengerOrderId').textContent = order.id;
  const itemsList = order.items.map(i => `• ${i.bookTitle} (x${i.quantity}) — ${formatVND(i.unitPriceVND * i.quantity)}`).join('\n');

  const messengerText = 
`[ĐƠN YÊU CẦU SƯU TẦM KTS — OOPS LA BOOK STORE]
Mã yêu cầu: ${order.id}
Người nhận: ${order.customer.fullName}
Số điện thoại: ${order.customer.phone}
Địa chỉ: ${order.customer.address}
${order.customer.notes ? 'Ghi chú: ' + order.customer.notes + '\n' : ''}
Danh mục ấn bản:
${itemsList}

Tổng giá trị niêm yết: ${formatVND(order.subtotalVND)}
(Cam kết giữ ấn bản sau khi Chủ tiệm xác nhận qua hotline/Messenger)`;

  const textarea = document.getElementById('messengerCopyBox');
  if (textarea) textarea.value = messengerText;

  modal.classList.remove('hidden');
}

function closeMessengerModal() {
  const modal = document.getElementById('messengerModal');
  if (modal) modal.classList.add('hidden');
}

function copyMessengerText() {
  const textarea = document.getElementById('messengerCopyBox');
  if (textarea) {
    textarea.select();
    navigator.clipboard.writeText(textarea.value).then(() => {
      showToast('Đã sao chép nội dung đơn hàng vào bộ nhớ tạm');
    });
  }
}

// 9. Admin CMS & Dual-Role Permission Engine (AC-11, OD-01)
function switchAdminRole(role) {
  state.adminRole = role;
  const roleLabel = document.getElementById('adminCurrentRoleLabel');
  const descEl = document.getElementById('adminRoleDesc');
  const roleBtnOwner = document.getElementById('roleBtnOwner');
  const roleBtnStaff = document.getElementById('roleBtnStaff');

  if (roleLabel) roleLabel.textContent = role;
  if (descEl) {
    if (role === 'OWNER') {
      descEl.textContent = 'Toàn quyền duyệt đơn, trừ tồn kho (AC-11), hủy đơn đã duyệt và chỉnh sửa chuyên mục.';
    } else {
      descEl.textContent = 'Chỉ được liên hệ và hủy đơn chưa xác nhận. Quyền xác nhận đơn (CONFIRMED) bị khóa (AC-11).';
    }
  }

  if (roleBtnOwner && roleBtnStaff) {
    if (role === 'OWNER') {
      roleBtnOwner.className = 'px-3 py-1 text-xs font-mono font-bold bg-amber-500 text-stone-950 rounded shadow-xs';
      roleBtnStaff.className = 'px-3 py-1 text-xs font-mono text-stone-400 hover:text-stone-100 rounded';
    } else {
      roleBtnStaff.className = 'px-3 py-1 text-xs font-mono font-bold bg-stone-700 text-white rounded shadow-xs';
      roleBtnOwner.className = 'px-3 py-1 text-xs font-mono text-stone-400 hover:text-stone-100 rounded';
    }
  }

  renderAdminOrders();
  showToast(`Đã chuyển ca trực: ${role}`);
}

function switchAdminTab(tab) {
  state.activeAdminTab = tab;
  ['dashboard', 'products', 'editorial', 'orders'].forEach(t => {
    const panel = document.getElementById('adminTab-' + t);
    const navBtn = document.getElementById('adminNavBtn-' + t);
    if (panel) {
      if (t === tab) panel.classList.remove('hidden');
      else panel.classList.add('hidden');
    }
    if (navBtn) {
      if (t === tab) {
        navBtn.className = 'w-full text-left px-4 py-3 flex items-center gap-3 bg-stone-800 text-white font-medium rounded-lg text-xs font-mono transition';
      } else {
        navBtn.className = 'w-full text-left px-4 py-3 flex items-center gap-3 text-stone-400 hover:text-white hover:bg-stone-800/50 rounded-lg text-xs font-mono transition';
      }
    }
  });

  if (tab === 'orders') renderAdminOrders();
  if (tab === 'products') renderAdminProducts();
  if (tab === 'dashboard') renderAdminDashboard();
}

function renderAdminDashboard() {
  const totalRev = state.orders.filter(o => o.status === 'CONFIRMED').reduce((s, o) => s + o.subtotalVND, 0);
  const pendingCount = state.orders.filter(o => o.status === 'PENDING_CONTACT').length;
  const staleCount = state.orders.filter(o => o.stale48h && o.status === 'PENDING_CONTACT').length;
  const lowStockCount = state.books.filter(b => b.stockCount === 1).length;

  const revEl = document.getElementById('adminKpiRevenue');
  const pendingEl = document.getElementById('adminKpiPending');
  const staleEl = document.getElementById('adminKpiStale');
  const lowStockEl = document.getElementById('adminKpiLowStock');

  if (revEl) revEl.textContent = formatVND(totalRev);
  if (pendingEl) pendingEl.textContent = pendingCount;
  if (staleEl) staleEl.textContent = staleCount;
  if (lowStockEl) lowStockEl.textContent = lowStockCount;
}

function renderAdminOrders() {
  const tbody = document.getElementById('adminOrdersTableBody');
  if (!tbody) return;

  tbody.innerHTML = state.orders.map(order => {
    let statusBadge = '';
    if (order.status === 'PENDING_CONTACT') {
      statusBadge = `<span class="px-2.5 py-1 text-[11px] font-mono font-medium rounded-md bg-amber-50 text-amber-800 border border-amber-200">Chờ liên hệ</span>`;
    } else if (order.status === 'CONTACTED') {
      statusBadge = `<span class="px-2.5 py-1 text-[11px] font-mono font-medium rounded-md bg-sky-50 text-sky-800 border border-sky-200">Đã liên hệ</span>`;
    } else if (order.status === 'CONFIRMED') {
      statusBadge = `<span class="px-2.5 py-1 text-[11px] font-mono font-medium rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">Đã chốt (Trừ kho)</span>`;
    } else {
      statusBadge = `<span class="px-2.5 py-1 text-[11px] font-mono font-medium rounded-md bg-rose-50 text-rose-800 border border-rose-200">Đã hủy</span>`;
    }

    const staleBadge = (order.stale48h && order.status === 'PENDING_CONTACT')
      ? `<span class="ml-1.5 px-2 py-0.5 text-[10px] font-mono font-bold bg-rose-100 text-rose-800 border border-rose-300 rounded uppercase">Quá 48H</span>`
      : '';

    // AC-11 Guard: Only Owner can confirm orders
    const isOwner = state.adminRole === 'OWNER';
    const canConfirm = isOwner && (order.status === 'PENDING_CONTACT' || order.status === 'CONTACTED');
    // OD-01 Guard: Staff cannot cancel confirmed orders
    const canCancel = (isOwner || order.status !== 'CONFIRMED') && order.status !== 'CANCELLED';

    return `
      <tr class="hover:bg-stone-50/80 transition-colors border-b border-stone-200/70">
        <td class="px-4 py-3.5 font-mono text-xs font-semibold text-stone-900">
          ${order.id}
          ${staleBadge}
        </td>
        <td class="px-4 py-3.5 text-xs">
          <div class="font-medium text-stone-900">${order.customer.fullName}</div>
          <div class="text-[11px] font-mono text-stone-500">${order.customer.phone}</div>
        </td>
        <td class="px-4 py-3.5 text-xs">
          <div class="text-stone-700 line-clamp-1 max-w-xs">${order.items.map(i => `${i.bookTitle} (x${i.quantity})`).join(', ')}</div>
          <div class="font-mono font-semibold text-stone-900 tabular-nums">${formatVND(order.subtotalVND)}</div>
        </td>
        <td class="px-4 py-3.5">${statusBadge}</td>
        <td class="px-4 py-3.5 text-right space-x-1.5">
          ${canConfirm ? `
            <button onclick="confirmOrder('${order.id}')" class="px-2.5 py-1.5 text-[11px] font-mono font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded transition">
              Duyệt chốt
            </button>
          ` : `
            <button disabled title="${!isOwner ? 'AC-11: Chỉ Chủ tiệm (Owner) có quyền duyệt chốt đơn' : 'Đơn đã xác nhận'}" class="px-2.5 py-1.5 text-[11px] font-mono bg-stone-100 text-stone-400 rounded cursor-not-allowed">
              ${!isOwner ? 'Khóa (Owner)' : 'Đã chốt'}
            </button>
          `}
          ${canCancel ? `
            <button onclick="cancelOrder('${order.id}')" class="px-2.5 py-1.5 text-[11px] font-mono text-rose-700 hover:bg-rose-50 border border-rose-200 rounded transition">
              Hủy
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

function confirmOrder(orderId) {
  if (state.adminRole !== 'OWNER') {
    alert('AC-11 Vi phạm phân quyền: Chỉ tài khoản OWNER mới được phép xác nhận đơn hàng.');
    return;
  }
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;

  // Single inventory decrement guarantee (AC-15 & OD-02)
  order.status = 'CONFIRMED';
  order.items.forEach(item => {
    const book = state.books.find(b => b.id === item.bookId);
    if (book && book.stockCount > 0) {
      book.stockCount = Math.max(0, book.stockCount - item.quantity);
      if (book.stockCount === 0) book.status = 'SOLD_OUT';
      else if (book.stockCount === 1) book.status = 'ONE_COPY_LEFT';
    }
  });

  renderAdminOrders();
  renderAdminDashboard();
  renderBooksGrid();
  showToast(`Đã duyệt đơn ${orderId} & trừ tồn kho thành công`);
}

function cancelOrder(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;

  if (order.status === 'CONFIRMED' && state.adminRole !== 'OWNER') {
    alert('OD-01 Vi phạm phân quyền: Nhân viên (STAFF) không được hủy đơn hàng đã được Owner xác nhận.');
    return;
  }

  order.status = 'CANCELLED';
  renderAdminOrders();
  renderAdminDashboard();
  showToast(`Đã hủy đơn hàng ${orderId}`);
}

function renderAdminProducts() {
  const tbody = document.getElementById('adminProductsTableBody');
  if (!tbody) return;

  tbody.innerHTML = state.books.map(book => {
    return `
      <tr class="hover:bg-stone-50 transition-colors border-b border-stone-200">
        <td class="px-4 py-3 flex items-center gap-3">
          <img src="${book.coverImage}" class="w-10 h-10 object-contain rounded border border-stone-200" />
          <div>
            <div class="font-serif font-bold text-stone-900 text-sm leading-tight">${book.title}</div>
            <div class="text-[11px] font-mono text-stone-400">${book.isbn} • ${book.category}</div>
          </div>
        </td>
        <td class="px-4 py-3 font-mono text-xs tabular-nums text-stone-900">${formatVND(book.priceVND)}</td>
        <td class="px-4 py-3">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs font-semibold tabular-nums">${book.stockCount}</span>
            <button onclick="adjustStock('${book.id}', 1)" class="w-5 h-5 flex items-center justify-center bg-stone-100 hover:bg-stone-200 rounded text-xs font-mono">+</button>
            <button onclick="adjustStock('${book.id}', -1)" class="w-5 h-5 flex items-center justify-center bg-stone-100 hover:bg-stone-200 rounded text-xs font-mono">-</button>
          </div>
        </td>
        <td class="px-4 py-3 text-xs">
          <span class="px-2 py-0.5 rounded text-[11px] font-mono ${
            book.status === 'IN_STOCK' ? 'bg-emerald-50 text-emerald-800' : book.status === 'ONE_COPY_LEFT' ? 'bg-amber-50 text-amber-800' : 'bg-stone-100 text-stone-600'
          }">${book.status}</span>
        </td>
      </tr>
    `;
  }).join('');
}

function adjustStock(bookId, delta) {
  const book = state.books.find(b => b.id === bookId);
  if (!book) return;
  book.stockCount = Math.max(0, book.stockCount + delta);
  if (book.stockCount === 0) book.status = 'SOLD_OUT';
  else if (book.stockCount === 1) book.status = 'ONE_COPY_LEFT';
  else book.status = 'IN_STOCK';

  renderAdminProducts();
  renderBooksGrid();
  showToast(`Đã cập nhật tồn kho ${book.title}: ${book.stockCount}`);
}

// 10. Toast Notification System
function showToast(msg) {
  const toast = document.getElementById('globalToast');
  const toastText = document.getElementById('globalToastMessage');
  if (!toast || !toastText) return;

  toastText.textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('flex');

  setTimeout(() => {
    toast.classList.add('hidden');
    toast.classList.remove('flex');
  }, 3200);
}

// 11. Initial Mount & Event Setup
document.addEventListener('DOMContentLoaded', () => {
  renderHeroShowcase();
  renderCatalogPills();
  renderBooksGrid();
  updateCartBadge();

  // Setup Tweaks Panel if available
  if (window.UDTweaks) {
    window.UDTweaks.init({
      storageKey: 'oops-la-claude-design-tweaks',
      controls: [
        { id: 'theme', label: 'Theme Mode', type: 'select', options: ['light', 'dark'], default: 'light', attr: 'data-theme' },
        { id: 'accent', label: 'Primary Accent', type: 'color', default: '#C2410C', cssVar: '--accent' },
        { id: 'radius', label: 'Corner Radius (px)', type: 'range', min: 0, max: 20, step: 2, default: 8, cssVar: '--radius-md', unit: 'px' }
      ]
    });
  }

  // Keyboard shortcut: Escape closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLookInsideModal();
      closeCheckoutModal();
      closeMessengerModal();
      const drawer = document.getElementById('cartDrawerBackdrop');
      if (drawer && !drawer.classList.contains('hidden')) drawer.classList.add('hidden');
    }
  });
});
