import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/render';
import { OrderSummary } from './OrderSummary';
import type { CartTotals } from '@/types/api';

const totals = (over: Partial<CartTotals> = {}): CartTotals => ({
  subtotal: '1900.00',
  discountTotal: '0.00',
  taxTotal: '342.00',
  shippingTotal: '0.00',
  grandTotal: '2242.00',
  ...over,
});

/**
 * This block is the last thing a shopper reads before paying, and it is shared
 * by the cart and checkout. What it must never do is imply a number it does not
 * have — a zero shipping cost before a delivery method is chosen is not "Free".
 */
describe('OrderSummary', () => {
  it('shows the server-computed total', () => {
    render(<OrderSummary totals={totals()} currency="INR" />);
    expect(screen.getByText('₹2,242.00')).toBeInTheDocument();
  });

  it('hides the discount line when there is no discount', () => {
    render(<OrderSummary totals={totals()} currency="INR" />);
    expect(screen.queryByText(/discount/i)).not.toBeInTheDocument();
  });

  it('names the coupon that produced a discount', () => {
    render(
      <OrderSummary
        totals={totals({ discountTotal: '190.00' })}
        currency="INR"
        couponCode="WELCOME10"
      />,
    );
    expect(screen.getByText('Discount (WELCOME10)')).toBeInTheDocument();
    expect(screen.getByText('−₹190.00')).toBeInTheDocument();
  });

  it('says shipping is calculated later before a method is chosen', () => {
    render(<OrderSummary totals={totals()} currency="INR" shippingChosen={false} />);
    expect(screen.getByText('Calculated at checkout')).toBeInTheDocument();
    expect(screen.queryByText('Free')).not.toBeInTheDocument();
  });

  it('says Free only once a method is chosen and it costs nothing', () => {
    render(<OrderSummary totals={totals()} currency="INR" shippingChosen />);
    expect(screen.getByText('Free')).toBeInTheDocument();
  });

  it('renders the shipping amount when there is one', () => {
    render(
      <OrderSummary totals={totals({ shippingTotal: '85.00' })} currency="INR" shippingChosen />,
    );
    expect(screen.getByText('₹85.00')).toBeInTheDocument();
  });

  it('formats in the store currency, not a hardcoded one', () => {
    render(
      <OrderSummary
        totals={totals({ grandTotal: '2242.00' })}
        currency="USD"
        shippingChosen
      />,
    );
    expect(screen.getByText(/\$2,242\.00/)).toBeInTheDocument();
  });

  it('renders the action passed to it', () => {
    render(
      <OrderSummary totals={totals()} currency="INR">
        <button>Checkout</button>
      </OrderSummary>,
    );
    expect(screen.getByRole('button', { name: 'Checkout' })).toBeInTheDocument();
  });
});
