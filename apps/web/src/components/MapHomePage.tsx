"use client";

import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import Map from "./Map";
import SignUpModal from "./SignUpModal";

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

export default function MapHomePage() {
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
        <div id="map" className="bg-white py-20">
            <style dangerouslySetInnerHTML={{__html: `
                .map-homepage-container .leaflet-container {
                    z-index: 0 !important;
                }
            `}} />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                    <h2 className="text-4xl font-bold text-gray-900 mb-4">Explore All 64 National Parks</h2>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                        Click on any park to learn more. Sign up to start tracking your visits and earning badges.
                    </p>
                </div>
                
                <div className="bg-gray-100 rounded-2xl overflow-hidden shadow-xl relative h-96 map-homepage-container">
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
                    <div className="absolute bottom-6 left-6 bg-white rounded-lg shadow-lg p-4 max-w-sm z-1">
                        <div className="flex items-start space-x-3">
                            <div className="bg-green-100 rounded-lg p-2">
                                <Info className="w-6 h-6 text-green-600" />
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-900 mb-1">Start Your Journey</h4>
                                <p className="text-sm text-gray-600 mb-3">Create a free account to track your visits, share photos, and connect with other explorers.</p>
                                <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition" onClick={() => setShowSignUpModal(true)}>
                                    Sign Up Now →
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {showSignUpModal && <SignUpModal open={showSignUpModal} onOpenChange={setShowSignUpModal} />}
        </div>
    );
}