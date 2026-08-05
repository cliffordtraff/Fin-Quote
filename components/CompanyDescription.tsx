import { normalizeExternalHttpUrl } from '@/lib/safe-url'

interface CompanyDescriptionProps {
  description: string
  ceo?: string | null
  fullTimeEmployees?: number | null
  website?: string | null
}

export default function CompanyDescription({
  description,
  ceo,
  fullTimeEmployees,
  website,
}: CompanyDescriptionProps) {
  if (!description) return null
  const safeWebsite = normalizeExternalHttpUrl(website)

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-950 dark:text-white">
        Company
      </h2>
      {(ceo || fullTimeEmployees || safeWebsite) && (
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          {ceo && (
            <span>
              <span className="font-medium">CEO:</span> {ceo}
            </span>
          )}
          {fullTimeEmployees && (
            <span>
              <span className="font-medium">Employees:</span> {fullTimeEmployees.toLocaleString()}
            </span>
          )}
          {safeWebsite && (
            <a
              href={safeWebsite}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {safeWebsite.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>
          )}
        </div>
      )}
      <details className="group mt-3 border-t border-gray-100 pt-2 dark:border-gray-700">
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between text-sm font-medium text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">
          <span>About the company</span>
          <span aria-hidden="true" className="transition-transform group-open:rotate-180">
            ↓
          </span>
        </summary>
        <p className="pb-1 pt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
          {description}
        </p>
      </details>
    </div>
  )
}
