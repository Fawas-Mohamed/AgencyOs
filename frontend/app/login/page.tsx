'use client';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { FormFeedback } from '@/components/ui/form-feedback';
import { useSubmission } from '@/lib/utils/form-state';
import { Button, ErrorNotice, Field } from '@/components/ui/primitives';
export default function Login() {
  const { busy, begin, end } = useSubmission();
  const [error, setError] = useState<unknown>(null);
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!begin()) return;
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await api('/auth/login', {
        method: 'POST',
        body: { email: form.get('email'), password: form.get('password') },
      });
      router.replace('/client-hub');
      router.refresh();
    } catch (e) {
      setError(e);
      end();
    }
  }
  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center p-5">
      <div className="panel w-full max-w-sm p-7">
        <Image src="/agency-os-logo.png" width={1774} height={887} alt="Agency OS" priority />
        <h1 className="mt-4">Sign in</h1>
        <p className="mt-2 mb-5 text-secondary">Access your client workspaces.</p>
        <ErrorNotice error={error} />
        <FormFeedback error={error}>
          <form className="space-y-4" onSubmit={submit}>
            <Field label="Email">
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                disabled={busy}
              />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={200}
                disabled={busy}
              />
            </Field>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </FormFeedback>
      </div>
    </main>
  );
}
