import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { productService } from '@/services/store.service';
import { useStore } from '@/features/theme/ThemeProvider';
import { formatMoney } from '@/utils/format';

export default function Home() {
  const store = useStore();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['products', 'featured'],
    queryFn: () => productService.list({ featured: true, limit: 8 }),
  });

  return (
    <>
      <section className="border-b border-ink-100">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <h1 className="max-w-2xl font-display text-4xl leading-tight tracking-tight text-ink-950 sm:text-5xl">
            {store.name}
          </h1>
          {store.description && (
            <p className="mt-4 max-w-lg text-base text-ink-500">{store.description}</p>
          )}
          <Link
            to="/shop"
            className="mt-8 inline-block rounded-card bg-brand px-6 py-3 text-sm font-medium text-white"
          >
            Shop everything
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="font-display text-xl tracking-tight text-ink-950">Featured</h2>

        {isLoading && (
          <div className="mt-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-square rounded-card bg-ink-100" />
                <div className="mt-3 h-4 w-3/4 rounded bg-ink-100" />
                <div className="mt-2 h-4 w-1/3 rounded bg-ink-100" />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="mt-8 rounded-card border border-ink-100 p-8 text-center">
            <p className="text-sm text-ink-700">Products couldn't be loaded.</p>
            <button onClick={() => refetch()} className="mt-3 text-sm font-medium text-brand">
              Try again
            </button>
          </div>
        )}

        {data && data.items.length === 0 && (
          <div className="mt-8 rounded-card border border-dashed border-ink-300 p-12 text-center">
            <p className="text-sm text-ink-700">Nothing here yet</p>
            <p className="mt-1 text-sm text-ink-500">New products will appear on this page.</p>
          </div>
        )}

        {data && data.items.length > 0 && (
          <div className="mt-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
            {data.items.map((product) => (
              <Link key={product.id} to={`/product/${product.slug}`} className="group">
                <div className="aspect-square overflow-hidden rounded-card bg-ink-50">
                  {product.images[0] ? (
                    <img
                      src={product.images[0].url}
                      alt={product.images[0].altText ?? product.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-ink-300">
                      No image
                    </div>
                  )}
                </div>
                <h3 className="mt-3 text-sm text-ink-900 group-hover:text-brand">{product.name}</h3>
                <p className="mt-1 flex items-baseline gap-2 text-sm">
                  <span className="font-medium text-ink-950">
                    {formatMoney(product.price, store.currency)}
                  </span>
                  {product.compareAtPrice && (
                    <span className="text-xs text-ink-300 line-through">
                      {formatMoney(product.compareAtPrice, store.currency)}
                    </span>
                  )}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
