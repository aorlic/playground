/**
 * Example JavaScript file to demonstrate metrics calculation
 */

function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i].price > 0) {
      total += items[i].price;
    }
  }
  return total;
}

function processOrder(order) {
  if (!order || !order.items) {
    return null;
  }

  const total = calculateTotal(order.items);

  if (total > 100) {
    return { ...order, total, discount: 10 };
  } else if (total > 50) {
    return { ...order, total, discount: 5 };
  } else {
    return { ...order, total, discount: 0 };
  }
}

class ShoppingCart {
  constructor() {
    this.items = [];
    this.discount = 0;
  }

  addItem(item) {
    this.items.push(item);
  }

  removeItem(itemId) {
    this.items = this.items.filter(item => item.id !== itemId);
  }

  getTotal() {
    return calculateTotal(this.items);
  }

  applyDiscount(percentage) {
    this.discount = percentage;
  }

  getFinalTotal() {
    const total = this.getTotal();
    return total - (total * this.discount / 100);
  }
}

module.exports = { calculateTotal, processOrder, ShoppingCart };
