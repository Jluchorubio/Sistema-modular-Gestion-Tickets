import { redirect } from 'next/navigation';

export default function OldConfigRedirect() {
  redirect('/config');
}
