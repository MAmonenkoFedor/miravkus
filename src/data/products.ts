import { Product, Category } from "@/types/product";

export const categories: Category[] = [
  { id: "1", name: "Подарочные наборы", slug: "gift-sets", image: "/placeholder.svg", productCount: 45 },
  { id: "2", name: "Премиум наборы", slug: "premium-sets", image: "/placeholder.svg", productCount: 28 },
  { id: "3", name: "Трюфели", slug: "truffles", image: "/placeholder.svg", productCount: 32 },
  { id: "4", name: "Шоколад", slug: "chocolate", image: "/placeholder.svg", productCount: 56 },
  { id: "5", name: "Азиатские сладости", slug: "asian-sweets", image: "/placeholder.svg", productCount: 89 },
  { id: "6", name: "Печенье и вафли", slug: "cookies", image: "/placeholder.svg", productCount: 41 },
];

export const products: Product[] = [
  {
    id: "1",
    name: "Подарочный набор «Золотой дракон»",
    price: 2990,
    oldPrice: 3990,
    discount: 25,
    image: "/placeholder.svg",
    rating: 4.9,
    reviewsCount: 128,
    category: "gift-sets",
    inStock: true,
    isPremium: true,
    description: "Роскошный набор азиатских сладостей в премиальной упаковке"
  },
  {
    id: "2",
    name: "Трюфели «Тёмный бархат» 16 шт",
    price: 1490,
    oldPrice: 1890,
    discount: 21,
    image: "/placeholder.svg",
    rating: 4.8,
    reviewsCount: 89,
    category: "truffles",
    inStock: true,
    description: "Изысканные трюфели из тёмного бельгийского шоколада"
  },
  {
    id: "3",
    name: "Премиум набор «Императорский»",
    price: 5990,
    image: "/placeholder.svg",
    rating: 5.0,
    reviewsCount: 45,
    category: "premium-sets",
    inStock: true,
    isPremium: true,
    description: "Эксклюзивная коллекция редких азиатских деликатесов"
  },
  {
    id: "4",
    name: "Моти ассорти «Сакура» 12 шт",
    price: 890,
    oldPrice: 1190,
    discount: 25,
    image: "/placeholder.svg",
    rating: 4.7,
    reviewsCount: 234,
    category: "asian-sweets",
    inStock: true,
    isNew: true,
    description: "Японские рисовые пирожные с разными начинками"
  },
  {
    id: "5",
    name: "Шоколад «Лунный свет» с матча",
    price: 590,
    image: "/placeholder.svg",
    rating: 4.6,
    reviewsCount: 156,
    category: "chocolate",
    inStock: true,
    description: "Белый шоколад с японским чаем матча"
  },
  {
    id: "6",
    name: "Набор печенья «Фортуна» 24 шт",
    price: 690,
    oldPrice: 890,
    discount: 22,
    image: "/placeholder.svg",
    rating: 4.5,
    reviewsCount: 312,
    category: "cookies",
    inStock: true,
    description: "Традиционное китайское печенье с предсказаниями"
  },
  {
    id: "7",
    name: "Трюфели «Розовый жемчуг» 9 шт",
    price: 1290,
    image: "/placeholder.svg",
    rating: 4.9,
    reviewsCount: 67,
    category: "truffles",
    inStock: true,
    isPremium: true,
    description: "Нежные трюфели с клубникой и белым шоколадом"
  },
  {
    id: "8",
    name: "Подарочный набор «Восточная сказка»",
    price: 3490,
    oldPrice: 4290,
    discount: 19,
    image: "/placeholder.svg",
    rating: 4.8,
    reviewsCount: 98,
    category: "gift-sets",
    inStock: true,
    description: "Коллекция лучших сладостей Востока в элегантной упаковке"
  },
  {
    id: "9",
    name: "Желейные конфеты «Манго» 200г",
    price: 390,
    image: "/placeholder.svg",
    rating: 4.4,
    reviewsCount: 445,
    category: "asian-sweets",
    inStock: true,
    description: "Натуральные желейные конфеты с манго из Тайланда"
  },
  {
    id: "10",
    name: "Премиум набор «Королевский»",
    price: 7990,
    image: "/placeholder.svg",
    rating: 5.0,
    reviewsCount: 23,
    category: "premium-sets",
    inStock: true,
    isPremium: true,
    description: "Самая роскошная коллекция для особенных подарков"
  },
  {
    id: "11",
    name: "Шоколад «Чёрный дракон» 72%",
    price: 490,
    oldPrice: 650,
    discount: 25,
    image: "/placeholder.svg",
    rating: 4.7,
    reviewsCount: 189,
    category: "chocolate",
    inStock: true,
    description: "Горький шоколад премиум класса с нотками специй"
  },
  {
    id: "12",
    name: "Вафельные трубочки «Хрустик» 18 шт",
    price: 450,
    image: "/placeholder.svg",
    rating: 4.3,
    reviewsCount: 267,
    category: "cookies",
    inStock: true,
    description: "Хрустящие вафельные трубочки с кремовой начинкой"
  },
];

export const getProductsByCategory = (categorySlug: string): Product[] => {
  return products.filter(p => p.category === categorySlug);
};

export const getPremiumProducts = (): Product[] => {
  return products.filter(p => p.isPremium);
};

export const getDiscountedProducts = (): Product[] => {
  return products.filter(p => p.discount && p.discount > 0);
};

export const getNewProducts = (): Product[] => {
  return products.filter(p => p.isNew);
};
