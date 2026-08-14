import { useStore } from '@/features/theme/ThemeProvider';
import { SECTIONS, isSectionKey, type SectionKey } from '@/features/storefront/sections';
import { StructuredData, storeSchema } from '@/features/seo/StructuredData';

/** Shown when a tenant has switched every section off, or has no theme row. */
const FALLBACK: SectionKey[] = ['hero', 'featured'];

/**
 * The homepage is assembled from the tenant's `homepageLayout`, in their order.
 *
 * This is the last piece of the white-label promise: two stores on one bundle
 * differ not only in colour and type but in which sections exist and where.
 * Unknown keys are skipped so a theme naming a section this build does not have
 * degrades to a shorter page rather than a blank one.
 */
export default function Home() {
  const store = useStore();

  const configured = store.theme.homepageLayout.filter(isSectionKey);
  const layout = configured.length > 0 ? configured : FALLBACK;

  return (
    <>
      <StructuredData
        data={storeSchema({
          name: store.name,
          description: store.description,
          url: window.location.origin,
          logo: store.theme.logoUrl,
        })}
      />

      {layout.map((key) => {
        const Section = SECTIONS[key];
        return <Section key={key} />;
      })}
    </>
  );
}
