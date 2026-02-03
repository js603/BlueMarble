import { BoardCell, CellType } from './types';

// Simplified 20-cell "Blue Marble" style board
// Levels: Land, Villa, Building, Hotel, Landmark(Seoul)
// Rent Multipliers roughly: x1, x2, x3, x5, x10

const createCity = (id: number, name: string, price: number, color: string): BoardCell => ({
  id,
  name,
  type: CellType.CITY,
  price,
  // HARD MODE: Base rent increased from 10% to 30% of land price
  // This ensures that landing on an opponent's city is devastating.
  rent: Math.floor(price * 0.3), 
  ownerId: null,
  color,
  buildingLevel: 0,
  buildingPrices: [
    price, // Land Cost (already paid)
    Math.floor(price * 0.5), // Villa
    Math.floor(price * 0.8), // Building
    Math.floor(price * 1.2), // Hotel
    Math.floor(price * 3.0), // Landmark (Only after Hotel)
  ]
});

export const INITIAL_BOARD: BoardCell[] = [
  // Bottom Row (Right to Left)
  { id: 0, name: '출발', type: CellType.START, price: 0, rent: 0, ownerId: null, color: '#94a3b8', buildingLevel: 0, buildingPrices: [] },
  createCity(1, '타이베이', 80, '#a3e635'), // Lime (Price Up)
  createCity(2, '베이징', 120, '#a3e635'),
  createCity(3, '마닐라', 150, '#a3e635'),
  { id: 4, name: '황금열쇠', type: CellType.CHANCE, price: 0, rent: 0, ownerId: null, color: '#fbbf24', buildingLevel: 0, buildingPrices: [] },
  
  // Corner: Island
  { id: 5, name: '무인도', type: CellType.ISLAND, price: 0, rent: 0, ownerId: null, color: '#475569', buildingLevel: 0, buildingPrices: [] },
  
  // Left Column (Bottom to Top)
  createCity(6, '아테네', 200, '#22d3ee'), // Cyan
  createCity(7, '코펜하겐', 240, '#22d3ee'),
  { id: 8, name: '황금열쇠', type: CellType.CHANCE, price: 0, rent: 0, ownerId: null, color: '#fbbf24', buildingLevel: 0, buildingPrices: [] },
  createCity(9, '베를린', 280, '#22d3ee'),
  
  // Corner: Concorde/Olympic
  { id: 10, name: '콩코드여객기', type: CellType.OLYMPIC, price: 0, rent: 0, ownerId: null, color: '#a855f7', buildingLevel: 0, buildingPrices: [] },
  
  // Top Row (Left to Right)
  createCity(11, '상파울루', 350, '#f472b6'), // Pink
  createCity(12, '부에노스', 400, '#f472b6'),
  { id: 13, name: '황금열쇠', type: CellType.CHANCE, price: 0, rent: 0, ownerId: null, color: '#fbbf24', buildingLevel: 0, buildingPrices: [] },
  createCity(14, '하와이', 450, '#f472b6'),
  
  // Corner: Tax
  { id: 15, name: '사회복지기금', type: CellType.TAX, price: 0, rent: 0, ownerId: null, color: '#ef4444', buildingLevel: 0, buildingPrices: [] },
  
  // Right Column (Top to Bottom)
  createCity(16, '도쿄', 550, '#60a5fa'), // Blue
  createCity(17, '파리', 650, '#60a5fa'),
  { id: 18, name: '황금열쇠', type: CellType.CHANCE, price: 0, rent: 0, ownerId: null, color: '#fbbf24', buildingLevel: 0, buildingPrices: [] },
  createCity(19, '서울', 950, '#60a5fa'), // High Risk High Return
];

// Rebalanced Economy for Faster Gameplay
export const INITIAL_MONEY = 2000; // Reduced from 3000
export const SALARY = 200; // Reduced from 500

export const PLAYER_COLORS = [
  '#f472b6', // Pink (Rocket)
  '#4ade80', // Green (Horse)
  '#38bdf8', // Blue (Car)
  '#fbbf24', // Amber (UFO)
  '#a78bfa', // Purple (Robot)
];

export const AVATAR_LABELS = ['로켓', '유니콘', '슈퍼카', 'UFO', '로봇'];

export const GOLDEN_KEYS = [
  { name: '병원비 납부', type: 'PAY', amount: 300, desc: '건강검진 비용 300만원을 지불합니다.' }, // Increased
  { name: '복권 당첨', type: 'EARN', amount: 500, desc: '복권에 당첨되어 500만원을 받습니다.' },
  { name: '무인도 탈출', type: 'ESCAPE', amount: 0, desc: '무인도 탈출권을 획득합니다.' },
  { name: '폭풍우', type: 'MOVE', position: 5, desc: '폭풍을 만나 무인도로 떠내려갑니다.' },
  { name: '세계일주', type: 'MOVE', position: 10, desc: '콩코드 여객기로 이동합니다.' },
  { name: '관광 여행', type: 'MOVE', position: 14, desc: '하와이로 휴가를 떠납니다.' },
  { name: '고속도로', type: 'MOVE', position: 0, desc: '출발지로 즉시 이동합니다.' },
  { name: '건물 수리비', type: 'PAY', amount: 400, desc: '소유한 건물의 수리비 400만원을 냅니다.' }, // Increased
];