interface CompanyDescriptionProps {
  description: string;
  ceo?: string | null;
  fullTimeEmployees?: number | null;
  website?: string | null;
}

export default function CompanyDescription({
  description,
  ceo,
  fullTimeEmployees,
  website,
}: CompanyDescriptionProps) {
  if (!description) return null;

  return (
    <div>
      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
        {description}
      </p>
      {(ceo || fullTimeEmployees || website) && (
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
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
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {website.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
