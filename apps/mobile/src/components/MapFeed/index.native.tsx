import { useRef, useState, useCallback, useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import MapView, { Region } from 'react-native-maps';
import ClusteredMapView from 'react-native-maps-clustering';
import { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import client from '@/api/client';
import { RunCard, RunMarker } from '../RunCard';

const SEOUL: Region = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

function latitudeDeltaToMeters(delta: number) {
  return Math.round(delta * 111000 * 0.6);
}

export function MapFeed() {
  const [region, setRegion] = useState<Region>(SEOUL);
  const [markers, setMarkers] = useState<RunMarker[]>([]);
  const [selected, setSelected] = useState<RunMarker | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);

  // 현재 위치로 초기 이동 + 마커 조회
  useEffect(() => {
    (async () => {
      let initialRegion = SEOUL;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        initialRegion = {
          ...SEOUL,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
      }
      setRegion(initialRegion);
      fetchMarkers(initialRegion);
    })();
  }, [fetchMarkers]);

  const fetchMarkers = useCallback(async (r: Region) => {
    try {
      const radius = latitudeDeltaToMeters(r.latitudeDelta);
      const { data } = await client.get<RunMarker[]>(
        `/runs?lat=${r.latitude}&lng=${r.longitude}&radius=${radius}`,
      );
      setMarkers(data);
    } catch {
      // 조용히 실패
    }
  }, []);

  const handleRegionChange = useCallback(
    (r: Region) => {
      setRegion(r);
      fetchMarkers(r);
    },
    [fetchMarkers],
  );

  const handleMarkerPress = useCallback((run: RunMarker) => {
    setSelected(run);
    bottomSheetRef.current?.expand();
  }, []);

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <ClusteredMapView
        style={StyleSheet.absoluteFillObject}
        region={region}
        onRegionChangeComplete={handleRegionChange}
        clusterColor="#E53935"
        radius={40}
        renderCluster={(cluster) => {
          const { geometry, onPress, properties } = cluster;
          const [lng, lat] = geometry.coordinates;
          return (
            <Marker
              key={`cluster-${properties.cluster_id}`}
              coordinate={{ latitude: lat, longitude: lng }}
              onPress={onPress}
            >
              <View style={styles.cluster}>
                <Text style={styles.clusterText}>+{properties.point_count}</Text>
              </View>
            </Marker>
          );
        }}
      >
        {markers.map((run) => {
          if (!run.startPoint) return null;
          const [lng, lat] = run.startPoint;
          return (
            <Marker
              key={run._id}
              coordinate={{ latitude: lat, longitude: lng }}
              onPress={() => handleMarkerPress(run)}
            >
              <View style={styles.dot} />
            </Marker>
          );
        })}
      </ClusteredMapView>

      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={['45%']}
        enablePanDownToClose
        backgroundStyle={styles.sheet}
        handleIndicatorStyle={styles.handle}
        onClose={() => setSelected(null)}
      >
        <BottomSheetView>
          {selected && <RunCard run={selected} />}
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  cluster: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E53935',
    borderWidth: 2,
    borderColor: '#fff',
  },
  sheet: {
    backgroundColor: '#18181b',
  },
  handle: {
    backgroundColor: '#52525b',
  },
});
