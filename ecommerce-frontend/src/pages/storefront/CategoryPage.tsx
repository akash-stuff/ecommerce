import { useParams } from 'react-router-dom';
import Shop from './Shop';

/** `/category/:slug` is the shop filtered to one branch of the tree. */
export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  return <Shop key={slug} categorySlug={slug} />;
}
