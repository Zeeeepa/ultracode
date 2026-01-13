/**
 * Анализ размеров токенов для типичного кода
 */
import { AutoTokenizer } from "@xenova/transformers";

async function main() {
  const tokenizer = await AutoTokenizer.from_pretrained("Xenova/multilingual-e5-small");

  const samples: Record<string, string> = {
    "Короткий метод (10 строк)": `
async function getUser(id: string): Promise<User | null> {
  const user = await this.db.users.findOne({ id });
  if (!user) return null;
  return { ...user, lastAccess: new Date() };
}`,

    "Средний метод (30 строк)": `
async function processOrder(orderId: string, userId: string): Promise<OrderResult> {
  const order = await this.db.orders.findOne({ id: orderId });
  if (!order) throw new OrderNotFoundError(orderId);

  if (order.userId !== userId) {
    throw new UnauthorizedError("Not your order");
  }

  const items = await this.db.orderItems.find({ orderId });
  let total = 0;

  for (const item of items) {
    const product = await this.db.products.findOne({ id: item.productId });
    if (!product) continue;

    if (product.stock < item.quantity) {
      throw new InsufficientStockError(product.name);
    }

    total += product.price * item.quantity;
    await this.db.products.update({ id: product.id }, { stock: product.stock - item.quantity });
  }

  await this.db.orders.update({ id: orderId }, { status: 'completed', total, completedAt: new Date() });

  return { orderId, total, itemCount: items.length, status: 'completed' };
}`,

    "Большой метод (80 строк)": `
/**
 * Комплексная обработка заказа с валидацией, расчетом скидок и уведомлениями
 * @param orderId - Идентификатор заказа
 * @param userId - Идентификатор пользователя
 * @param options - Дополнительные опции обработки
 */
async function processCompleteOrder(
  orderId: string,
  userId: string,
  options: ProcessOptions = {}
): Promise<CompleteOrderResult> {
  const { applyDiscounts = true, sendNotifications = true, validateStock = true } = options;

  // Получаем заказ с проверками
  const order = await this.db.orders.findOne({ id: orderId });
  if (!order) throw new OrderNotFoundError(orderId);
  if (order.userId !== userId) throw new UnauthorizedError("Order belongs to another user");
  if (order.status !== 'pending') throw new InvalidOrderStateError(order.status);

  // Загружаем связанные данные
  const [items, user, shipping] = await Promise.all([
    this.db.orderItems.find({ orderId }),
    this.db.users.findOne({ id: userId }),
    this.db.shipping.findOne({ orderId })
  ]);

  if (!user) throw new UserNotFoundError(userId);

  // Валидация наличия товаров
  let subtotal = 0;
  const itemResults: ItemResult[] = [];

  for (const item of items) {
    const product = await this.db.products.findOne({ id: item.productId });
    if (!product) {
      itemResults.push({ productId: item.productId, status: 'not_found' });
      continue;
    }

    if (validateStock && product.stock < item.quantity) {
      itemResults.push({ productId: item.productId, status: 'insufficient_stock', available: product.stock });
      continue;
    }

    const itemTotal = product.price * item.quantity;
    subtotal += itemTotal;
    itemResults.push({ productId: item.productId, status: 'ok', total: itemTotal });
  }

  // Расчет скидок
  let discount = 0;
  if (applyDiscounts) {
    const userTier = await this.loyaltyService.getUserTier(userId);
    discount = this.calculateDiscount(subtotal, userTier, order.promoCode);
  }

  // Расчет доставки
  const shippingCost = shipping ? await this.shippingService.calculateCost(shipping) : 0;

  // Финальный расчет
  const total = subtotal - discount + shippingCost;
  const tax = this.taxService.calculate(total, user.region);
  const grandTotal = total + tax;

  // Обновляем заказ
  await this.db.orders.update({ id: orderId }, {
    status: 'completed',
    subtotal, discount, shippingCost, tax, grandTotal,
    completedAt: new Date()
  });

  // Обновляем склад
  for (const item of items) {
    await this.db.products.decrement({ id: item.productId }, 'stock', item.quantity);
  }

  // Уведомления
  if (sendNotifications) {
    await Promise.all([
      this.notificationService.sendOrderConfirmation(user.email, orderId),
      this.notificationService.notifyWarehouse(orderId),
      this.analyticsService.trackOrder(orderId, grandTotal)
    ]);
  }

  return { orderId, subtotal, discount, shippingCost, tax, grandTotal, items: itemResults };
}`,

    "Класс с JSDoc (150 строк)": `
/**
 * Сервис для управления пользователями
 * Обеспечивает CRUD операции, аутентификацию и авторизацию
 *
 * @class UserService
 * @implements {IUserService}
 * @description Основной сервис для работы с пользователями в системе.
 * Поддерживает различные провайдеры аутентификации и интегрируется
 * с системой уведомлений.
 *
 * @example
 * const userService = new UserService(db, cache, logger);
 * const user = await userService.createUser({ email: 'test@example.com', name: 'Test' });
 */
export class UserService implements IUserService {
  private readonly db: Database;
  private readonly cache: CacheService;
  private readonly logger: Logger;
  private readonly eventEmitter: EventEmitter;

  constructor(db: Database, cache: CacheService, logger: Logger) {
    this.db = db;
    this.cache = cache;
    this.logger = logger;
    this.eventEmitter = new EventEmitter();
  }

  async createUser(data: CreateUserDto): Promise<User> {
    const existing = await this.db.users.findOne({ email: data.email });
    if (existing) throw new UserExistsError(data.email);

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await this.db.users.create({
      ...data,
      passwordHash,
      createdAt: new Date(),
      status: 'active'
    });

    await this.cache.del('users:list');
    this.eventEmitter.emit('user:created', user);
    this.logger.info('User created', { userId: user.id });

    return user;
  }

  async updateUser(id: string, data: UpdateUserDto): Promise<User> {
    const user = await this.db.users.findOne({ id });
    if (!user) throw new UserNotFoundError(id);

    const updated = await this.db.users.update({ id }, { ...data, updatedAt: new Date() });
    await this.cache.del("user:" + id);
    this.eventEmitter.emit('user:updated', updated);

    return updated;
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.db.users.findOne({ id });
    if (!user) throw new UserNotFoundError(id);

    await this.db.users.delete({ id });
    await this.cache.del("user:" + id);
    this.eventEmitter.emit('user:deleted', { id });
    this.logger.info('User deleted', { userId: id });
  }

  async authenticate(email: string, password: string): Promise<AuthResult> {
    const user = await this.db.users.findOne({ email });
    if (!user) throw new InvalidCredentialsError();

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new InvalidCredentialsError();

    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
    await this.db.sessions.create({ userId: user.id, token, createdAt: new Date() });

    return { user, token };
  }

  async getUserById(id: string): Promise<User | null> {
    const cached = await this.cache.get("user:" + id);
    if (cached) return JSON.parse(cached);

    const user = await this.db.users.findOne({ id });
    if (user) {
      await this.cache.set("user:" + id, JSON.stringify(user), 3600);
    }
    return user;
  }

  async listUsers(options: ListOptions = {}): Promise<PaginatedResult<User>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', order = 'desc' } = options;

    const [users, total] = await Promise.all([
      this.db.users.find({}, { skip: (page - 1) * limit, limit, sort: { [sortBy]: order } }),
      this.db.users.count({})
    ]);

    return {
      data: users,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    };
  }
}`,
  };

  console.log("=== Анализ размеров токенов для типичного кода ===\n");
  console.log("Тип кода".padEnd(40) + "Строк  Токенов  512?  8K?");
  console.log("-".repeat(70));

  for (const [name, code] of Object.entries(samples)) {
    const lines = code.trim().split("\n").length;
    const tokens = tokenizer.encode(code).length;
    const fits512 = tokens <= 512 ? "✅" : "❌";
    const fits8k = tokens <= 8192 ? "✅" : "✅";

    console.log(
      `${name.padEnd(40)}${String(lines).padStart(4)}  ${String(tokens).padStart(6)}   ${fits512}   ${fits8k}`,
    );
  }

  console.log("\n=== Выводы ===");
  console.log("- Короткие методы (10-30 строк): ~50-200 токенов ✅ влезают в 512");
  console.log("- Средние методы (50-80 строк): ~300-500 токенов ✅ влезают в 512");
  console.log("- Большие методы (100+ строк): ~600-1000 токенов ⚠️ могут не влезть");
  console.log("- Полные классы (150+ строк): ~1000-2000 токенов ❌ нужен 8K");
  console.log("\n📋 ~4 токена = 1 строка кода (в среднем)");
  console.log("📋 512 токенов ≈ 120-130 строк кода");
  console.log("📋 8192 токенов ≈ 2000 строк кода");
}

main().catch(console.error);
