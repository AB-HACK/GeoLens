import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600">GeoLens</h1>
          <div className="flex gap-4">
            <Link
              href="/auth/login"
              className="px-4 py-2 text-blue-600 hover:text-blue-700 font-medium"
            >
              Login
            </Link>
            <Link
              href="/auth/register"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-12">
        <section className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Discover Where Your Photos Were Taken
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Upload any image and GeoLens uses advanced AI to predict the location, extract visual evidence, and show you what the model sees.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/auth/login">
              <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors">
                Login
              </button>
            </Link>
            <Link href="/auth/register">
              <button className="bg-white hover:bg-gray-100 text-blue-600 font-bold py-3 px-8 rounded-lg text-lg border-2 border-blue-600 transition-colors">
                Create Account
              </button>
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Smart Detection
            </h3>
            <p className="text-gray-600">
              Advanced AI analyzes landmarks, objects, and visual features in your photo
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Evidence-Based
            </h3>
            <p className="text-gray-600">
              See the reasoning behind each prediction with detailed evidence breakdown
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-4xl mb-4">🗺️</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Interactive Map
            </h3>
            <p className="text-gray-600">
              Explore predicted locations on a map and view weather information
            </p>
          </div>
        </section>

        <section className="mt-20 bg-white rounded-lg shadow-md p-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-blue-600 mb-2">1</div>
              <h3 className="font-bold text-gray-900 mb-2">Upload</h3>
              <p className="text-gray-600 text-sm">
                Upload any photo from your device
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-blue-600 mb-2">2</div>
              <h3 className="font-bold text-gray-900 mb-2">Analyze</h3>
              <p className="text-gray-600 text-sm">
                AI processes visual features and predicts location
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-blue-600 mb-2">3</div>
              <h3 className="font-bold text-gray-900 mb-2">Explore</h3>
              <p className="text-gray-600 text-sm">
                Review predictions and evidence on an interactive map
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-blue-600 mb-2">4</div>
              <h3 className="font-bold text-gray-900 mb-2">Learn</h3>
              <p className="text-gray-600 text-sm">
                Understand the reasoning behind each prediction
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
