"use client";

import { useState, useEffect } from "react";

interface TestResult {
  name: string;
  endpoint: string;
  status: "pending" | "success" | "failed";
  latency: number | null;
  error: string | null;
}

export default function TestConnectionPage() {
  const [results, setResults] = useState<TestResult[]>([
    { name: "Backend Health Check", endpoint: "GET /", status: "pending", latency: null, error: null },
    { name: "Models Endpoint", endpoint: "GET /detects/models", status: "pending", latency: null, error: null },
  ]);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const runTests = async () => {
    // Reset results
    setResults((prev) =>
      prev.map((r) => ({ ...r, status: "pending", latency: null, error: null }))
    );

    // Test 1: Health check
    const test1Start = performance.now();
    try {
      const res = await fetch(`${API_BASE_URL}/`);
      const data = await res.json();
      const latency = Math.round(performance.now() - test1Start);
      if (res.ok && data.status === "ok") {
        setResults((prev) =>
          prev.map((r) =>
            r.endpoint === "GET /"
              ? { ...r, status: "success", latency, error: null }
              : r
          )
        );
      } else {
        setResults((prev) =>
          prev.map((r) =>
            r.endpoint === "GET /"
              ? { ...r, status: "failed", latency, error: `Unexpected response: ${JSON.stringify(data)}` }
              : r
          )
        );
      }
    } catch (err) {
      const latency = Math.round(performance.now() - test1Start);
      setResults((prev) =>
        prev.map((r) =>
          r.endpoint === "GET /"
            ? { ...r, status: "failed", latency, error: err instanceof Error ? err.message : "Request failed" }
            : r
        )
      );
    }

    // Test 2: Models endpoint
    const test2Start = performance.now();
    try {
      const res = await fetch(`${API_BASE_URL}/detects/models`);
      const latency = Math.round(performance.now() - test2Start);
      if (res.ok) {
        const data = await res.json();
        setResults((prev) =>
          prev.map((r) =>
            r.endpoint === "GET /detects/models"
              ? {
                  ...r,
                  status: "success",
                  latency,
                  error: null,
                }
              : r
          )
        );
      } else {
        setResults((prev) =>
          prev.map((r) =>
            r.endpoint === "GET /detects/models"
              ? { ...r, status: "failed", latency, error: `HTTP ${res.status}: ${res.statusText}` }
              : r
          )
        );
      }
    } catch (err) {
      const latency = Math.round(performance.now() - test2Start);
      setResults((prev) =>
        prev.map((r) =>
          r.endpoint === "GET /detects/models"
            ? { ...r, status: "failed", latency, error: err instanceof Error ? err.message : "Request failed" }
            : r
        )
      );
    }
  };

  useEffect(() => {
    runTests();
  }, []);

  const allPassed = results.every((r) => r.status === "success");
  const allDone = results.every((r) => r.status !== "pending");

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-purple-100 to-purple-200 flex items-center justify-center p-4">
      <div className="bg-white/90 rounded-2xl shadow-lg p-8 w-full max-w-lg">
        <h1 className="text-2xl font-bold text-purple-800 mb-2 text-center">
          Frontend-Backend Connection Test
        </h1>
        <p className="text-sm text-purple-500 text-center mb-6">
          API Base URL: <code className="bg-purple-100 px-2 py-0.5 rounded text-purple-700">{API_BASE_URL}</code>
        </p>

        <div className="space-y-4">
          {results.map((result, index) => (
            <div
              key={index}
              className={`border rounded-lg p-4 ${
                result.status === "pending"
                  ? "border-yellow-300 bg-yellow-50"
                  : result.status === "success"
                  ? "border-green-300 bg-green-50"
                  : "border-red-300 bg-red-50"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-gray-800">{result.name}</span>
                <span className="text-xs text-gray-500">{result.endpoint}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {result.status === "pending" && (
                    <div className="w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                  )}
                  {result.status === "success" && (
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {result.status === "failed" && (
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span
                    className={`text-sm font-medium ${
                      result.status === "pending"
                        ? "text-yellow-700"
                        : result.status === "success"
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                  >
                    {result.status === "pending"
                      ? "Testing..."
                      : result.status === "success"
                      ? "Connected"
                      : "Failed"}
                  </span>
                </div>
                {result.latency !== null && (
                  <span className="text-xs text-gray-500">{result.latency}ms</span>
                )}
              </div>
              {result.error && (
                <p className="mt-2 text-sm text-red-600 bg-red-100 rounded px-2 py-1">
                  {result.error}
                </p>
              )}
            </div>
          ))}
        </div>

        {allDone && (
          <div
            className={`mt-6 p-3 rounded-lg text-center font-semibold ${
              allPassed
                ? "bg-green-100 text-green-800 border border-green-300"
                : "bg-red-100 text-red-800 border border-red-300"
            }`}
          >
            {allPassed
              ? "✓ All tests passed! Frontend is connected to the backend."
              : "✗ Some tests failed. Check the errors above."}
          </div>
        )}

        <button
          onClick={runTests}
          className="mt-6 w-full px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors"
        >
          Run Tests Again
        </button>
      </div>
    </div>
  );
}