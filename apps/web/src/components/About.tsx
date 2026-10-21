"use client";

import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { useEffect, useState } from "react";
import Map from "./Map";
import SignUpModal from "./SignUpModal";
import { FlagTriangleRight } from "lucide-react";

interface ParkFromDB {
  park_code: string;
  name: string;
  latitude: string | null;
  longitude: string | null;
  description: string | null;
}

interface ParkForMap {
  park_code: string;
  name: string;
  position: [number, number];
  status: 'visited' | 'notVisited' | 'bucketList';
  description?: string;
}

export default function About() {
  const [parks, setParks] = useState<ParkForMap[]>([]);
  const [isLoadingParks, setIsLoadingParks] = useState(true);
  const [showSignUpModal, setShowSignUpModal] = useState(false);

  useEffect(() => {
    fetchParks();
  }, []);

  const fetchParks = async () => {
    try {
      setIsLoadingParks(true);
      
      const parksResponse = await fetch('/api/parks');

      if (!parksResponse.ok) {
        throw new Error('Failed to fetch parks');
      }

      const parksData: ParkFromDB[] = await parksResponse.json();
      
      // Transform database parks to map format (only parks with coordinates)
      const transformedParks: ParkForMap[] = parksData
        .filter(park => park.latitude && park.longitude)
        .map(park => ({
          park_code: park.park_code,
          name: park.name,
          position: [
            parseFloat(park.latitude!),
            parseFloat(park.longitude!)
          ] as [number, number],
          status: 'notVisited' as const,
          description: park.description || undefined,
        }));
      
      setParks(transformedParks);
    } catch (error) {
      console.error('Error fetching parks:', error);
    } finally {
      setIsLoadingParks(false);
    }
  };

  return (
    <div id="about" className="bg-white py-20">
      <style dangerouslySetInnerHTML={{__html: `
        .map-homepage-container .leaflet-container {
          z-index: 0 !important;
        }
      `}} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Explore All 64 National Parks</h1>
          <p className="text-xl text-gray-600">Discover America&apos;s natural wonders and track your adventures</p>
        </div>

        {/* Two Column Layout: About Content | Map */}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-stretch">
          {/* Left Column: About Content */}
          <div>
            <Card className="bg-gray-50 border-gray-200">
              <CardContent className="px-6 sm:px-8 py-2 space-y-6">
                <div className="mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">About</h2>
                </div>
                <div className="space-y-4">
                  <p className="text-base sm:text-lg leading-relaxed text-gray-700">
                    Hi, I&apos;m <Link href="https://danglorioso.com" target="_blank" rel="noopener noreferrer" className="text-green-600 underline decoration-green-600/30 hover:decoration-green-600/60 font-medium">Dan Glorioso</Link>, and I grew up taking family vacations roadtripping around the country to different national parks every summer. Through these trips, I gained a deep appreciation for the natural beauty and massive diversity within our national parks.
                  </p>

                  <p className="text-base sm:text-lg leading-relaxed text-gray-700">
                    Over the years, I&apos;ve really enjoyed hiking and exploring more national parks. Each park really has its own unique charm and fascinating story, and I love how the national parks have allowed me to discover natural beauties that lie within the US.
                  </p>

                  <p className="text-base sm:text-lg leading-relaxed text-gray-700">
                    That&apos;s why I created this app to keep track of where you&apos;ve been and to help other adventurers who, like me, enjoy experiencing new regions of the country. Whether you&apos;re planning an upcoming park visit or working toward checking all 64 national parks off your list, I&apos;ve designed this app to help you document your journeys and share your experiences with others.
                  </p>

                  <p className="text-base sm:text-lg leading-relaxed text-gray-700">
                    I hope this app motivates you to visit even more of these incredible places. Happy exploring!
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Map */}
          <div className="flex flex-col h-full gap-8 justify-between">
            <div className="w-full items-center">
              <h3 className="text-xl font-bold text-gray-900 mb-4">See Your Progress on the Map</h3>
              <div className="bg-gray-100 rounded-2xl overflow-hidden shadow-xl relative h-96 w-full map-homepage-container">
                {isLoadingParks ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-lg text-gray-600">Loading parks...</div>
                  </div>
                ) : (
                  <div className="h-full w-full relative" style={{ zIndex: 0 }}>
                    <Map 
                      center={[39.8283, -98.5795]} 
                      zoom={3}
                      className="h-full w-full"
                      parks={parks}
                    />
                  </div>
                )}
              </div>
            </div>
            <Card className="bg-gray-50/20 border-gray-200">
              <CardContent>
              <div className="flex items-start space-x-3">
                <div className="bg-green-100 rounded-lg p-2">
                  <FlagTriangleRight className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Start Your Journey</h4>
                  <p className="text-sm text-gray-600 mb-3">Create a free account to track your visits, share photos, and connect with other explorers.</p>
                  <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition" onClick={() => setShowSignUpModal(true)}>
                    Sign Up Now →
                  </button>
                </div>
              </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      {showSignUpModal && <SignUpModal open={showSignUpModal} onOpenChange={setShowSignUpModal} />}
    </div>
  );
}

