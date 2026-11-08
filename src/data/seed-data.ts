/**
 * Oops La Book Store — Seed Data
 * Curated architectural monographs, technical drawings, and editorial essays.
 * Single Currency Guarantee: Every price is strictly in VNĐ.
 */

import type { Book, MediaAsset, EditorialArticle } from '../types/domain.ts';

export const SEED_BOOKS: Book[] = [
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
    coverImage: 'cover-bowwow-01.jpg',
    description: 'Ấn bản kinh điển trình bày 43 công trình nhà ở của Atelier Bow-Wow qua các bản vẽ mặt cắt phối cảnh (Sectional Perspective) tỷ lệ 1:20 vẽ tay hoàn toàn. Từng chi tiết đồ đạc, nếp sinh hoạt và vật liệu được bóc tách với độ chuẩn xác vi mô.',
    category: 'Monograph',
    featured: true,
    tags: ['Atelier Bow-Wow', 'Sectional Perspective', '1:20', 'Tokyo Housing', 'Japanese Architecture']
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
    coverImage: 'cover-bowwow-02.jpg',
    description: 'Phần hai tiếp nối công trình giải phẫu không gian, mở rộng từ nhà ở riêng lẻ sang các tổ hợp nhà ở tập thể, công trình công cộng và không gian sinh hoạt cộng đồng tại Tokyo.',
    category: 'Technical Drawings',
    featured: false,
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
    dimensionsText: '390 × 540 mm (SUMO Ultra-Oversized, 18.5 kg)',
    priceVND: 38000000,
    stockCount: 1,
    status: 'ONE_COPY_LEFT',
    coverImage: 'cover-ando-sumo.jpg',
    description: 'Ấn bản SUMO khổ cực đại có chữ ký khắc laser của Tadao Ando, đi kèm giá đỡ sách thiết kế độc bản. Tuyển tập toàn bộ công trình bê tông trần danh tiếng như Church of the Light, Naoshima Benesse House.',
    category: 'Sumo Edition',
    featured: true,
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
    coverImage: 'cover-pet-arch.jpg',
    description: 'Khảo sát 79 công trình kiến trúc "thú cưng" kỳ dị được xây dựng trên những mảnh đất thừa, kẹt giữa đường cao tốc và khe hẹp đô thị Tokyo.',
    category: 'Urban Theory',
    featured: false,
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
    coverImage: 'cover-made-in-tokyo.jpg',
    description: 'Bản hướng dẫn các công trình lai ghép vô thức tại Tokyo: bãi tập golf trên nóc siêu thị, đường cao tốc đâm xuyên cao ốc. Hiện đã tạm hết hàng.',
    category: 'Urban Theory',
    featured: false,
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
    coverImage: 'cover-ethnography.jpg',
    description: 'Ấn phẩm chính thức đại diện gian triển lãm Nhật Bản tại Venice Biennale 2018, phân tích cách thức quan sát dân tộc học kiến trúc qua các bản vẽ tay và nghiên cứu thực địa.',
    category: 'Technical Drawings',
    featured: false,
    tags: ['Venice Biennale', 'Ethnography', 'Fieldwork', 'Hand Drawing']
  }
];

export const SEED_MEDIA_ASSETS: MediaAsset[] = [
  {
    id: 'ols-media-01',
    bookId: 'ols-book-01',
    assetType: 'FRONT',
    sortOrder: 1,
    title: 'Dust Jacket — Isometric Floor Plan & Red Annotations',
    scaleLabel: 'Cover Plate',
    imageUrl: '',
    svgPlateIndex: 0
  },
  {
    id: 'ols-media-02',
    bookId: 'ols-book-01',
    assetType: 'SPINE',
    sortOrder: 2,
    title: 'Cerulean Blue Cloth Hardcover with Gold Foil Stamping',
    scaleLabel: 'Binding Spec',
    imageUrl: '',
    svgPlateIndex: 1
  },
  {
    id: 'ols-media-03',
    bookId: 'ols-book-01',
    assetType: 'SPREAD',
    sortOrder: 3,
    title: 'Sectional Plan Perspective (1:50) & Joinery Details (1:10)',
    scaleLabel: '1:50 / 1:10 Detail',
    imageUrl: '',
    svgPlateIndex: 2
  },
  {
    id: 'ols-media-04',
    bookId: 'ols-book-01',
    assetType: 'SPREAD',
    sortOrder: 4,
    title: 'Steep Pitched Roof Section with Spiral Staircase (1:20)',
    scaleLabel: '1:20 Technical Section',
    imageUrl: '',
    svgPlateIndex: 3
  },
  {
    id: 'ols-media-05',
    bookId: 'ols-book-01',
    assetType: 'SPREAD',
    sortOrder: 5,
    title: 'Cantilever Balcony Detail (1:10) & Structural Cross-Section (1:20)',
    scaleLabel: '1:10 / 1:20 Anatomy',
    imageUrl: '',
    svgPlateIndex: 4
  },
  {
    id: 'ols-media-06',
    bookId: 'ols-book-01',
    assetType: 'BACK',
    sortOrder: 6,
    title: 'Exploded Isometric Axonometric (1:20) — House & Atelier Bow-Wow',
    scaleLabel: '1:20 Axonometric',
    imageUrl: '',
    svgPlateIndex: 5
  }
];

export const SEED_ARTICLES: EditorialArticle[] = [
  {
    id: 'ols-art-01',
    title: 'Atelier Bow-Wow và Nghệ Thuật Giải Phẫu Không Gian 1:20',
    slug: 'atelier-bow-wow-nghe-thuat-giai-phau-khong-gian-1-20',
    excerpt: 'Tại sao bản vẽ mặt cắt phối cảnh (Sectional Perspective) tỷ lệ 1:20 lại trở thành ngôn ngữ định danh cho trường phái kiến trúc hành vi Tokyo?',
    content: `Trong thế giới của chuyên khảo kiến trúc, ít có cuốn sách nào tạo ra cú hích thị giác và phương pháp luận mạnh mẽ như "Graphic Anatomy Atelier Bow-Wow" do TOTO Publishing xuất bản năm 2007.

Không giống các bản vẽ kiến trúc thương mại trau chuốt bằng phần mềm render 3D bóng bẩy nhưng vô hồn, Yoshiharu Tsukamoto và Momoyo Kaijima chọn một lối đi khổ hạnh: vẽ tay toàn bộ mặt cắt phối cảnh với tỷ lệ cố định 1:20.

Ở tỷ lệ 1:20, kiến trúc không còn là hình khối trừu tượng mà trở thành "giải phẫu học không gian" (Spatial Anatomy). Người đọc có thể nhìn thấy độ dày của lớp ván sàn 15mm, vị trí mối nối thép mạ kẽm, và thậm chí cả chiếc ấm đun nước trên bệ bếp. Đó là nơi kiến trúc và cuộc sống thường nhật hòa làm một thể hữu cơ.`,
    coverImage: 'art-bowwow-anatomy.jpg',
    author: 'Giám tuyển Oops La',
    publishedAt: '2026-11-01T09:00:00Z',
    relatedBookIds: ['ols-book-01', 'ols-book-02'],
    status: 'PUBLISHED'
  },
  {
    id: 'ols-art-02',
    title: 'TASCHEN SUMO Edition: Khi Cuốn Sách Trở Thành Vật Thể Kiến Trúc Độc Lập',
    slug: 'taschen-sumo-edition-vat-the-kien-truc-doc-lap',
    excerpt: 'Khảo sát ấn bản Tadao Ando XXL nặng 18.5kg và triết lý "Cuốn sách không chỉ để đọc, mà là một khối điêu khắc trong không gian sống".',
    content: `Được sáng lập bởi Benedikt Taschen năm 1999 với ấn bản đầu tiên của Helmut Newton, định dạng SUMO đã định nghĩa lại ranh giới giữa một cuốn sách và một tác phẩm nghệ thuật trưng bày.

Với ấn phẩm "Tadao Ando: Complete Works XXL", cuốn sách vượt qua kích thước thông thường (390 x 540 mm) để phản ánh trung thực quy mô các công trình bê tông trần của kiến trúc sư đoạt giải Pritzker. Mỗi trang mở ra như một bức tường bảo tàng thu nhỏ, đòi hỏi người xem phải tương tác vật lý bằng cả cơ thể để lật mở.`,
    coverImage: 'art-taschen-sumo.jpg',
    author: 'KTS. Lê Quang (Khách mời)',
    publishedAt: '2026-11-03T14:30:00Z',
    relatedBookIds: ['ols-book-03'],
    status: 'PUBLISHED'
  }
];
