import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-sm border-b border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="text-2xl font-bold bg-gradient-to-r from-emerald-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              runaq
            </div>
            <Link
              href="/login"
              className="px-6 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
            >
              Login
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/20 via-gray-950 to-purple-950/20" />
        <div className="relative max-w-7xl mx-auto text-center">
          <h1 className="text-6xl sm:text-7xl md:text-8xl font-bold mb-6 bg-gradient-to-r from-emerald-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
            runaq
          </h1>
          <p className="text-3xl sm:text-4xl font-semibold text-gray-200 mb-4">
            Your Life Operating System
          </p>
          <p className="text-xl text-gray-400 mb-8 max-w-3xl mx-auto">
            AI-powered productivity dashboard that unifies health, work, relationships, and mindfulness
            into a single, self-hosted command center for your life.
          </p>
          <Link
            href="/login"
            className="inline-block px-10 py-4 text-lg font-semibold bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 rounded-lg transition-all transform hover:scale-105 shadow-lg shadow-emerald-500/25"
          >
            Get Started
          </Link>
        </div>
      </section>

      {/* Four Quadrants Feature Grid */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-gray-800/50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4 text-gray-100">
            Four Pillars of Life
          </h2>
          <p className="text-center text-gray-400 mb-16 max-w-2xl mx-auto">
            Runaq organizes your life into four interconnected quadrants, each powered by specialized AI agents.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Lifeforce */}
            <div className="group relative bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-xl p-6 hover:border-emerald-500/50 transition-all">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="w-12 h-12 mb-4 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full border-2 border-emerald-500" />
                </div>
                <h3 className="text-2xl font-bold text-emerald-400 mb-3">
                  Lifeforce
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  Track health metrics, biometrics, sleep patterns, exercise routines, and nutrition.
                  AI-powered wellness insights help you optimize your physical well-being.
                </p>
              </div>
            </div>

            {/* Industry */}
            <div className="group relative bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-xl p-6 hover:border-blue-500/50 transition-all">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="w-12 h-12 mb-4 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <div className="w-6 h-6 rounded border-2 border-blue-500" />
                </div>
                <h3 className="text-2xl font-bold text-blue-400 mb-3">
                  Industry
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  Manage tasks, sprints, and projects with kanban boards and timeline views.
                  Delegate work to AI agents and track autonomous task completion in real-time.
                </p>
              </div>
            </div>

            {/* Fellowship */}
            <div className="group relative bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-xl p-6 hover:border-rose-500/50 transition-all">
              <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="w-12 h-12 mb-4 rounded-lg bg-rose-500/10 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full border-2 border-rose-500">
                    <div className="w-2 h-2 bg-rose-500 rounded-full mx-auto mt-1" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-rose-400 mb-3">
                  Fellowship
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  Nurture relationships with contact management, connection reminders, and interaction history.
                  Never forget important dates or lose touch with the people who matter.
                </p>
              </div>
            </div>

            {/* Essence */}
            <div className="group relative bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-xl p-6 hover:border-purple-500/50 transition-all">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="w-12 h-12 mb-4 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <div className="w-6 h-6 text-purple-500 text-xl">✨</div>
                </div>
                <h3 className="text-2xl font-bold text-purple-400 mb-3">
                  Essence
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  Cultivate mindfulness through journaling, gratitude practice, meditation tracking, and reflection.
                  Build self-awareness and emotional intelligence over time.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI Agents Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-gray-800/50">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold mb-6 text-gray-100">
                Intelligent AI Agents
              </h2>
              <p className="text-lg text-gray-400 mb-6 leading-relaxed">
                Runaq employs a sophisticated multi-agent system with 4 generalist agents (one per quadrant)
                and 6 specialized agents for complex tasks.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-200 mb-1">Generalist → Specialist Delegation</h4>
                    <p className="text-gray-400">
                      Generalist agents analyze tasks and automatically delegate to specialists when needed,
                      ensuring optimal problem-solving for complex challenges.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-200 mb-1">Autonomous Task Completion</h4>
                    <p className="text-gray-400">
                      Agents work independently to complete assigned tasks, from data analysis to automated workflows,
                      reporting back with results and insights.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-200 mb-1">Scheduled Cron Jobs</h4>
                    <p className="text-gray-400">
                      Set up recurring tasks and automation. Agents run on schedule to generate reports,
                      process data, or trigger workflows without manual intervention.
                    </p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-blue-500/10 to-purple-500/10 rounded-2xl blur-3xl" />
              <div className="relative bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-2xl p-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-emerald-400">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-mono text-sm">Generalist: Lifeforce analyzing health data...</span>
                  </div>
                  <div className="flex items-center gap-3 text-blue-400 pl-6">
                    <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                    <span className="font-mono text-sm">Specialist: Research Agent running analysis...</span>
                  </div>
                  <div className="flex items-center gap-3 text-purple-400">
                    <div className="w-3 h-3 rounded-full bg-purple-500" />
                    <span className="font-mono text-sm">Task completed: Weekly summary generated</span>
                  </div>
                  <div className="flex items-center gap-3 text-rose-400">
                    <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
                    <span className="font-mono text-sm">Generalist: Fellowship scheduling reminders...</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-gray-800/50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4 text-gray-100">
            Powerful Integrations
          </h2>
          <p className="text-center text-gray-400 mb-16 max-w-2xl mx-auto">
            Runaq connects with your favorite tools and services to create a unified productivity ecosystem.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-gray-800/50 flex items-center justify-center">
                <span className="text-2xl">🧠</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-200 mb-2">Memory System</h3>
              <p className="text-gray-400 text-sm">
                Persistent SQLite database stores your entire life history, accessible to AI agents for context-aware assistance.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-gray-800/50 flex items-center justify-center">
                <span className="text-2xl">📝</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-200 mb-2">Obsidian Sync</h3>
              <p className="text-gray-400 text-sm">
                Bidirectional sync with your Obsidian vault. Notes, journals, and knowledge bases stay in perfect harmony.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-purple-500/20 to-rose-500/20 border border-gray-800/50 flex items-center justify-center">
                <span className="text-2xl">🤖</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-200 mb-2">LCM Integration</h3>
              <p className="text-gray-400 text-sm">
                Connect to Large Context Models for advanced reasoning, document analysis, and natural language understanding.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-rose-500/20 to-emerald-500/20 border border-gray-800/50 flex items-center justify-center">
                <span className="text-2xl">🔌</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-200 mb-2">OpenClaw Gateway</h3>
              <p className="text-gray-400 text-sm">
                Extensible plugin system with 42 built-in tools. Add custom capabilities and third-party integrations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Self-Hosted Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-gray-800/50">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-block px-4 py-1 mb-6 text-sm font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
            Your Data, Your Control
          </div>
          <h2 className="text-4xl font-bold mb-6 text-gray-100">
            Self-Hosted. Private. Yours.
          </h2>
          <p className="text-xl text-gray-400 mb-12 max-w-3xl mx-auto leading-relaxed">
            Runaq runs entirely on your infrastructure. No cloud dependencies, no data collection, no subscription fees.
            Your life data stays on your machine, encrypted and under your complete control.
          </p>

          <div className="grid md:grid-cols-3 gap-8 text-left">
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-xl p-6">
              <div className="text-3xl mb-3">🗄️</div>
              <h3 className="text-lg font-semibold text-gray-200 mb-2">SQLite Database</h3>
              <p className="text-gray-400 text-sm">
                Single-file database means your entire life is portable. Back up with a simple file copy.
              </p>
            </div>

            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-xl p-6">
              <div className="text-3xl mb-3">🏠</div>
              <h3 className="text-lg font-semibold text-gray-200 mb-2">Local-First Architecture</h3>
              <p className="text-gray-400 text-sm">
                Works offline by default. No internet required for core functionality. Sync when you choose.
              </p>
            </div>

            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-xl p-6">
              <div className="text-3xl mb-3">🔒</div>
              <h3 className="text-lg font-semibold text-gray-200 mb-2">Zero Cloud Lock-In</h3>
              <p className="text-gray-400 text-sm">
                No vendor dependencies. Export your data anytime. Migrate to any infrastructure you want.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-gray-800/50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6 text-gray-100">
            Ready to Take Control?
          </h2>
          <p className="text-xl text-gray-400 mb-8">
            Start building your Life Operating System today. Free, open-source, and built for power users.
          </p>
          <Link
            href="/login"
            className="inline-block px-10 py-4 text-lg font-semibold bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 rounded-lg transition-all transform hover:scale-105 shadow-lg shadow-emerald-500/25"
          >
            Get Started Now
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-gray-800/50">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-gray-400 text-sm">
              Built with <span className="text-emerald-400 font-semibold">Octavius</span>
            </div>
            <div className="text-gray-400 text-sm">
              Self-hosted. Private. Yours.
            </div>
            <div className="flex gap-6">
              <a href="#" className="text-gray-400 hover:text-gray-300 transition-colors text-sm">
                Documentation
              </a>
              <a href="#" className="text-gray-400 hover:text-gray-300 transition-colors text-sm">
                GitHub
              </a>
              <a href="#" className="text-gray-400 hover:text-gray-300 transition-colors text-sm">
                Community
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
