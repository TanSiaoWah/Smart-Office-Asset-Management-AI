import Link from "next/link";
import NavAuth from "@/components/NavAuth";
import BackendWakeUp from "@/components/BackendWakeUp";

export default function Home() {
  return (
    <>
      <BackendWakeUp />
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-purple-100 to-purple-200">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-sm shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-purple-800">Smart Office Asset Management AI</span>
          </div>
          <NavAuth />
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-purple-900 mb-6">
            Transform Your Office
            <span className="block text-purple-600">with AI-Powered Asset Management</span>
          </h1>
          <p className="text-lg md:text-xl text-purple-700 max-w-3xl mx-auto mb-10">
            Smart Office Asset Management AI uses advanced computer vision to instantly identify office equipment,
            track maintenance schedules, and manage inventory. Say goodbye to manual tracking and hello to
            organized, efficient asset management.
          </p>
          <div className="flex justify-center space-x-4">
            <Link href="/scans">
              <button className="px-8 py-3 bg-purple-600 text-white rounded-lg text-lg font-semibold hover:bg-purple-700 transform hover:scale-105 transition-all shadow-lg hover:shadow-xl">
                Start Scanning Now
              </button>
            </Link>
            <Link href="/inventory">
              <button className="px-8 py-3 bg-white text-purple-600 rounded-lg text-lg font-semibold border-2 border-purple-300 hover:bg-purple-50 transform hover:scale-105 transition-all">
                View Inventory
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white/90 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow">
            <div className="w-16 h-16 bg-purple-200 rounded-full flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.23A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.23A2 2 0 0017.07 7H18a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 116 0" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-purple-800 mb-4">Asset Scanning</h3>
            <p className="text-purple-600">
              Simply take a photo of your office equipment or assets. Our AI instantly recognizes
              and catalogs everything for you.
            </p>
          </div>

          <div className="bg-white/90 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow">
            <div className="w-16 h-16 bg-purple-200 rounded-full flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-purple-800 mb-4">Maintenance Tracking</h3>
            <p className="text-purple-600">
              Never miss equipment maintenance. Get smart notifications when assets are approaching
              their service dates or warranty expiration.
            </p>
          </div>

          <div className="bg-white/90 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow">
            <div className="w-16 h-16 bg-purple-200 rounded-full flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-purple-800 mb-4">Asset Insights</h3>
            <p className="text-purple-600">
              Discover asset documentation and usage insights. Optimize resource allocation and
              reduce operational costs.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="bg-white/50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-center text-purple-800 mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="w-20 h-20 bg-purple-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-3xl font-bold text-white">1</span>
              </div>
              <h3 className="text-xl font-semibold text-purple-800 mb-3">Scan Your Assets</h3>
              <p className="text-purple-600">
                Take a photo of your office assets using your smartphone or webcam.
              </p>
            </div>
            <div className="text-center">
              <div className="w-20 h-20 bg-purple-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-3xl font-bold text-white">2</span>
              </div>
              <h3 className="text-xl font-semibold text-purple-800 mb-3">AI Recognition</h3>
              <p className="text-purple-600">
                Our advanced AI identifies and catalogs your assets with high accuracy.
              </p>
            </div>
            <div className="text-center">
              <div className="w-20 h-20 bg-purple-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-3xl font-bold text-white">3</span>
              </div>
              <h3 className="text-xl font-semibold text-purple-800 mb-3">Get Insights</h3>
              <p className="text-purple-600">
                Receive maintenance alerts, asset documentation, and usage analytics.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-purple-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
                </svg>
              </div>
              <span className="text-xl font-bold">Smart Office Asset Management AI</span>
            </div>
            <p className="text-purple-300 mb-8">
              AI-powered office asset management for a smarter, efficient workplace.
            </p>
          </div>
          <div className="border-t border-purple-800 pt-8 text-center text-purple-300">
            © 2026 Smart Office Asset Management AI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
    </>
  );
}
