<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.10.2" name="master_animated_water" tilewidth="16" tileheight="16" tilecount="4" columns="4">
 <image source="ninja_animated_water.webp" width="64" height="16"/>
 <tile id="0">
  <properties>
   <property name="surface" type="string" value="water_shallow"/>
   <property name="isWater" type="bool" value="true"/>
   <property name="solid" type="bool" value="true"/>
  </properties>
  <animation>
   <frame tileid="0" duration="280"/>
   <frame tileid="1" duration="280"/>
   <frame tileid="2" duration="280"/>
   <frame tileid="3" duration="280"/>
  </animation>
 </tile>
</tileset>
