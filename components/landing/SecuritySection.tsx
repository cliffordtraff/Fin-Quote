export default function SecuritySection() {
  return (
    <section id="security" className="bg-white py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-6">
        {/* Data Integration */}
        <div className="bg-cream-100 rounded-3xl p-8 md:p-12 mb-16">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-serif text-2xl md:text-3xl text-gray-900 mb-4">
                Connect directly to your data
              </h2>
              <p className="text-gray-600 leading-relaxed">
                Sync your market data sources safely and securely,
                allowing you to gain a comprehensive overview of
                your finances in one convenient location.
              </p>
            </div>

            <div className="relative">
              {/* Decorative Arrows */}
              <div className="absolute top-0 right-0 grid grid-cols-2 gap-2">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="w-10 h-10 flex items-center justify-center"
                    style={{
                      background: i % 2 === 0 ? '#e8ebe3' : 'transparent',
                      borderRadius: '4px',
                    }}
                  >
                    <svg
                      className="w-5 h-5 text-sage-600"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7z" />
                    </svg>
                  </div>
                ))}
              </div>

              {/* Connection Card */}
              <div className="bg-white rounded-xl shadow-sm p-4 inline-flex items-center gap-4 relative z-10">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Connect to data</p>
                  <p className="text-xs text-gray-500">Connect to 500+ supported sources.</p>
                </div>
                <div className="w-10 h-10 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div className="border-t-2 border-sage-500 pt-16">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h2 className="font-serif text-2xl md:text-3xl text-gray-900 mb-4">
                Security is built in, from the ground up.
              </h2>
              <p className="text-gray-600 leading-relaxed mb-8">
                Our robust security measures are designed to protect your
                sensitive data and give you peace of mind.
              </p>

              {/* Security Features */}
              <div className="space-y-8">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Bank-Level Encryption
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    With robust encryption protocols in place, your data is
                    securely transmitted and stored, ensuring that your
                    personal and financial details remain protected.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Two-Factor Authentication
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    This additional security measure helps prevent
                    unauthorized access to your account, providing you with
                    peace of mind knowing that your financial data is safe.
                  </p>
                </div>
              </div>
            </div>

            {/* Security Visual */}
            <div className="flex items-center justify-center">
              <div className="relative w-64 h-64">
                {/* Circular Diagram */}
                <svg className="w-full h-full" viewBox="0 0 200 200">
                  {/* Outer dashed circle */}
                  <circle
                    cx="100"
                    cy="100"
                    r="90"
                    fill="none"
                    stroke="#e5e5e0"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  {/* Middle circle */}
                  <circle
                    cx="100"
                    cy="100"
                    r="60"
                    fill="none"
                    stroke="#d4d9ca"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  {/* Inner circle */}
                  <circle
                    cx="100"
                    cy="100"
                    r="30"
                    fill="none"
                    stroke="#b5bea6"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />

                  {/* Connection nodes */}
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
                    const radius = i % 2 === 0 ? 90 : 60
                    const x = 100 + radius * Math.cos((angle * Math.PI) / 180)
                    const y = 100 + radius * Math.sin((angle * Math.PI) / 180)
                    return (
                      <g key={i}>
                        <circle cx={x} cy={y} r="4" fill="#d4d9ca" />
                        {i % 3 === 0 && (
                          <path
                            d={`M100,100 L${x},${y}`}
                            stroke="#e5e5e0"
                            strokeWidth="1"
                            strokeDasharray="2 2"
                          />
                        )}
                      </g>
                    )
                  })}

                  {/* Center icon */}
                  <circle cx="100" cy="100" r="16" fill="#5a6b4a" />
                  <path
                    d="M95,100 L98,103 L105,96"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
